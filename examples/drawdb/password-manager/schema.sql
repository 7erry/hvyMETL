/* The account and its key material. The master password itself is never stored or transmitted - only the salt, the work factor and a verifier, so the database is useless to whoever steals it. */
CREATE TABLE IF NOT EXISTS "users" (
	-- Surrogate primary key. Local row id; the server, if any, knows this account by account_uuid.
	"id" INTEGER,
	-- Stable identifier used in sharing and sync. A UUID rather than the local id, because local ids differ on every device.
	"account_uuid" TEXT NOT NULL UNIQUE,
	-- Login identity and the salt input for key derivation, which is why changing it forces a full re-derivation.
	"email" TEXT NOT NULL UNIQUE,
	-- Shown to people this user shares vaults with.
	"display_name" TEXT NOT NULL,
	-- argon2id | pbkdf2. Stored so an old vault opens after the default is upgraded.
	"kdf_algorithm" TEXT NOT NULL DEFAULT 'argon2id',
	-- Per-account salt for deriving the master key from the master password.
	"kdf_salt" BLOB NOT NULL,
	-- Work factor. Raised over time; the stored value is what an existing vault was encrypted with.
	"kdf_iterations" INTEGER NOT NULL DEFAULT 3,
	-- Authentication tag proving a derived key is correct, so a wrong master password fails fast without decrypting anything.
	"master_key_verifier" BLOB NOT NULL,
	-- The account RSA/X25519 private key, encrypted under the master key. Used to unwrap vault keys shared by other people.
	"encrypted_private_key" BLOB NOT NULL,
	-- Public half, stored in the clear. Anyone can wrap a vault key for this user without the server learning it.
	"public_key" BLOB NOT NULL,
	-- Account creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id")
);

/* A key boundary, not a folder. Every item in a vault is encrypted under one symmetric vault key, so sharing a vault means wrapping that one key rather than re-encrypting every item. */
CREATE TABLE IF NOT EXISTS "vaults" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Stable cross-device identifier.
	"vault_uuid" TEXT NOT NULL UNIQUE,
	-- Account that created the vault and can delete it or revoke members.
	"owner_id" INTEGER NOT NULL,
	-- Vault name. Deliberately plaintext: it is the one label the UI must render before any key is unwrapped.
	"name" TEXT NOT NULL,
	-- True for the private vault created at signup, which cannot be shared or deleted.
	"is_personal" BOOLEAN NOT NULL DEFAULT true,
	-- Cached count for the sidebar. Maintained on write because counting encrypted rows is the only kind of counting the database can still do.
	"item_count" INTEGER NOT NULL DEFAULT 0,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Last change to the vault or anything in it; drives sync.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("owner_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Membership and the per-member wrapped key in one row. Because access is a key you hold rather than a flag a server checks, deleting this row genuinely removes access to future versions of the data. */
CREATE TABLE IF NOT EXISTS "vault_members" (
	-- Vault being granted. Part of the composite key.
	"vault_id" INTEGER,
	-- Member receiving access. Part of the composite key.
	"user_id" INTEGER,
	-- The vault key encrypted to this member public key. This column is the whole access-control mechanism: revoking a member deletes their copy, and no other member has to re-encrypt anything.
	"wrapped_vault_key" BLOB NOT NULL,
	-- read | write | admin. Enforced by the client; the server cannot check it because it cannot read the items either.
	"permission" TEXT NOT NULL DEFAULT 'read',
	-- When the member unwrapped the key for the first time. Null while the invitation is outstanding.
	"accepted_at" TIMESTAMP,
	-- Grant time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("vault_id", "user_id"),
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("user_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Self-referencing folder tree inside a vault. Sorting is plaintext and naming is not, which is the pattern the whole schema repeats: keep in the clear only what the UI needs while locked. */
CREATE TABLE IF NOT EXISTS "folders" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Owning vault. Folders never span vaults, because they would span key boundaries.
	"vault_id" INTEGER NOT NULL,
	-- Containing folder. Null for a top-level folder.
	"parent_id" INTEGER,
	-- Folder name, encrypted. Even a folder called "Work bank accounts" leaks intent, so it is not stored in the clear.
	"name_ciphertext" BLOB NOT NULL,
	-- Per-row AEAD nonce. Never reused with the same key; that is why it lives on the row rather than being derived from the id.
	"name_nonce" BLOB NOT NULL,
	-- Manual sort order among siblings. Plaintext, because ordering must survive a locked vault.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("parent_id") REFERENCES "folders"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* One credential, card or note. Everything sensitive is a ciphertext column; the plaintext columns exist only where a query genuinely cannot be done client-side, and each one is a deliberate, documented leak. */
CREATE TABLE IF NOT EXISTS "items" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Stable cross-device identifier, generated on the client so an offline device can create items without coordination.
	"item_uuid" TEXT NOT NULL UNIQUE,
	-- Owning vault, and therefore the key the ciphertext columns are encrypted under.
	"vault_id" INTEGER NOT NULL,
	-- Containing folder. Null for items at the vault root.
	"folder_id" INTEGER,
	-- login | card | identity | secure_note | ssh_key. Plaintext, because the list must render with the correct icons before unlock.
	"item_type" TEXT NOT NULL DEFAULT 'login',
	-- Item title, encrypted. The database can return it but never read it.
	"name_ciphertext" BLOB NOT NULL,
	-- AEAD nonce for name_ciphertext.
	"name_nonce" BLOB NOT NULL,
	-- HMAC of the lowercased, normalised title under a per-vault index key. Equality search works; ordering, prefix search and substring search do not. This is the entire compromise the schema makes.
	"name_blind_index" TEXT,
	-- HMAC of the registrable domain, so autofill can ask "which items match this site?" without the store learning which sites the user visits.
	"domain_blind_index" TEXT,
	-- Plaintext flag. A boolean leaks almost nothing and makes the favourites view usable while most fields stay opaque.
	"favorite" BOOLEAN NOT NULL DEFAULT false,
	-- Require the master password again before revealing this item, even in an unlocked vault.
	"reprompt" BOOLEAN NOT NULL DEFAULT false,
	-- Soft-delete marker. Kept so a delete can propagate to other devices; a hard delete would simply reappear on the next sync from a stale peer.
	"deleted_at" TIMESTAMP,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Last edit. Plaintext and therefore a metadata leak the design accepts, because sync needs it.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("folder_id") REFERENCES "folders"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_items_vault_deleted"
ON "items" ("vault_id", "deleted_at");

CREATE INDEX IF NOT EXISTS "idx_items_name_blind"
ON "items" ("name_blind_index");

CREATE INDEX IF NOT EXISTS "idx_items_domain_blind"
ON "items" ("domain_blind_index");
/* The encryption boundary itself. Fields are rows rather than columns on items so a login can carry arbitrary custom secrets, and so each secret gets its own nonce and tag. */
CREATE TABLE IF NOT EXISTS "item_fields" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Owning item.
	"item_id" INTEGER NOT NULL,
	-- username | password | totp | note | custom_text | custom_hidden. Plaintext so the UI can lay out a form before unlocking.
	"field_kind" TEXT NOT NULL,
	-- Label for a custom field, encrypted. Null for standard fields, whose label comes from field_kind.
	"label_ciphertext" BLOB,
	-- The secret itself, AEAD-encrypted under the vault key. The database stores bytes it can never interpret; no index on this column would mean anything.
	"value_ciphertext" BLOB NOT NULL,
	-- Per-row nonce. Rotating a value must generate a fresh one - nonce reuse under the same key destroys the confidentiality of both values.
	"nonce" BLOB NOT NULL,
	-- AEAD tag over the ciphertext and the item_uuid as associated data, so a tampered row fails to decrypt instead of returning a swapped secret.
	"auth_tag" BLOB NOT NULL,
	-- Display order within the item.
	"position" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("item_id") REFERENCES "items"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_item_fields_item_position"
ON "item_fields" ("item_id", "position");
/* Second-factor seeds, split out because their parameters are structured and public while their seed is not. Storing them beside passwords is a trade-off the user makes knowingly, so it gets its own table and its own audit entries. */
CREATE TABLE IF NOT EXISTS "totp_secrets" (
	-- Item this generator belongs to. One per item, so the item id is the primary key.
	"item_id" INTEGER,
	-- Base32 TOTP seed, encrypted. Never leaves the client in the clear; codes are generated locally, which is why an online breach of the store yields no working second factors.
	"secret_ciphertext" BLOB NOT NULL,
	-- AEAD nonce for secret_ciphertext.
	"nonce" BLOB NOT NULL,
	-- SHA1 | SHA256 | SHA512. Plaintext; it is a protocol parameter, not a secret.
	"algorithm" TEXT NOT NULL DEFAULT 'SHA1',
	-- Code length, 6 or 8.
	"digits" INTEGER NOT NULL DEFAULT 6,
	-- Rotation window in seconds.
	"period_seconds" INTEGER NOT NULL DEFAULT 30,
	-- When the generator was added.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("item_id"),
	FOREIGN KEY ("item_id") REFERENCES "items"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Append-only previous values, capped per item by the client. It exists because the common real-world failure is a rotation that breaks a login and has to be undone within minutes. */
CREATE TABLE IF NOT EXISTS "password_history" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Item whose password changed.
	"item_id" INTEGER NOT NULL,
	-- The superseded password, still encrypted. Old passwords are secrets too and never demoted to plaintext.
	"value_ciphertext" BLOB NOT NULL,
	-- AEAD nonce for this row.
	"nonce" BLOB NOT NULL,
	-- Zxcvbn-style 0-4 score computed on the client before encryption. Storing the score rather than the password is how a weak-password report exists at all.
	"strength_score" INTEGER,
	-- When this value stopped being current. Drives "you last rotated this 400 days ago".
	"replaced_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("item_id") REFERENCES "items"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_password_history_item_time"
ON "password_history" ("item_id", "replaced_at");
/* Tags are the clearest illustration of the blind-index trick: uniqueness and filtering work on a keyed hash, while the human-readable name stays unreadable to the store. */
CREATE TABLE IF NOT EXISTS "tags" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Owning vault; tags do not cross key boundaries.
	"vault_id" INTEGER NOT NULL,
	-- Tag name, encrypted like every other user-authored label.
	"name_ciphertext" BLOB NOT NULL,
	-- AEAD nonce for name_ciphertext.
	"name_nonce" BLOB NOT NULL,
	-- HMAC of the normalised tag name, so tag filtering is an indexed equality match and a tag can be deduplicated without decrypting every row.
	"name_blind_index" TEXT NOT NULL,
	-- Hex swatch. Plaintext and harmless; it lets the list render colour before unlock.
	"color" TEXT,
	PRIMARY KEY("id"),
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tags_vault_blind"
ON "tags" ("vault_id", "name_blind_index");
/* Join table with a composite primary key and no surrogate id. Nothing else points at a tagging, so a second key would only be a second index to maintain. */
CREATE TABLE IF NOT EXISTS "item_tags" (
	-- Tagged item. Part of the composite key.
	"item_id" INTEGER,
	-- Applied tag. Part of the composite key, which also enforces that a tag is applied at most once.
	"tag_id" INTEGER,
	-- When the tag was applied; used to break ties during sync merges.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("item_id", "tag_id"),
	FOREIGN KEY ("item_id") REFERENCES "items"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* A pending key handover. It is a separate table from vault_members because an invitation exists before a key can be wrapped, and because a declined or expired offer must leave a trace. */
CREATE TABLE IF NOT EXISTS "share_invitations" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Vault being offered.
	"vault_id" INTEGER NOT NULL,
	-- Member extending the invitation.
	"inviter_id" INTEGER NOT NULL,
	-- Address invited. Plaintext by necessity - an email has to be sent to it.
	"invitee_email" TEXT NOT NULL,
	-- Resolved account once the invitee signs up. Null while the address has no account yet.
	"invitee_user_id" INTEGER,
	-- Vault key wrapped to the invitee public key. Null until the invitee has a key to wrap to, which is why an invitation to a new user is a two-step handshake.
	"wrapped_vault_key" BLOB,
	-- Hash of the single-use acceptance token. The token itself is only ever in the email, so the database cannot mint an acceptance.
	"token_hash" TEXT NOT NULL UNIQUE,
	-- read | write | admin. Copied into vault_members on acceptance.
	"permission" TEXT NOT NULL DEFAULT 'read',
	-- Hard expiry, typically days. An unbounded invitation is a standing key-distribution offer.
	"expires_at" TIMESTAMP NOT NULL,
	-- Acceptance time. Null while pending; set here rather than deleting the row so the audit trail survives.
	"accepted_at" TIMESTAMP,
	-- Invitation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("inviter_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_invites_vault_email"
ON "share_invitations" ("vault_id", "invitee_email");
/* Append-only access log, stored in the clear on purpose. It records that a secret was revealed, never which secret value - the metadata is the whole point, and encrypting it would make the log unusable for detecting compromise. */
CREATE TABLE IF NOT EXISTS "audit_events" (
	-- Surrogate primary key. Monotonic, and the ordering the log is read in.
	"id" INTEGER,
	-- Actor. Null for events attributed to a revoked or deleted account, which must still appear in the log.
	"user_id" INTEGER,
	-- Vault touched. Null for account-level events such as a failed unlock.
	"vault_id" INTEGER,
	-- Item touched. Null for vault-level events; set null on delete so the log outlives the item.
	"item_id" INTEGER,
	-- unlock_failed | item_viewed | secret_copied | item_created | item_updated | item_deleted | member_added | member_revoked | export.
	"action" TEXT NOT NULL,
	-- Client that performed the action, as reported by that client. Null when unknown.
	"device_label" TEXT,
	-- Source address for server-mediated actions. Null for purely local ones, which is most of them in a local-first client.
	"ip_address" TEXT,
	-- Event time.
	"occurred_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("user_id") REFERENCES "users"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("vault_id") REFERENCES "vaults"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("item_id") REFERENCES "items"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_audit_vault_time"
ON "audit_events" ("vault_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "idx_audit_user_time"
ON "audit_events" ("user_id", "occurred_at");
