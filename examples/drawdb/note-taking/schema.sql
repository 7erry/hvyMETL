/* Known devices for this account. A local-first app has no authoritative server clock, so identity and ordering both have to start from something the device owns. */
CREATE TABLE IF NOT EXISTS "devices" (
	-- Surrogate primary key. Local row id, meaningful only inside this database file.
	"id" INTEGER,
	-- Stable identifier generated on first launch. Every id this device mints is namespaced by it, which is how two offline devices avoid colliding without asking a server for permission.
	"device_uuid" TEXT NOT NULL UNIQUE,
	-- User-visible label, e.g. "iPad" or "Work laptop".
	"name" TEXT NOT NULL,
	-- macos | windows | linux | ios | android.
	"platform" TEXT NOT NULL,
	-- True for exactly one row - the device this file lives on. Lets a query say "my changes" without threading a parameter through every call site.
	"is_current" BOOLEAN NOT NULL DEFAULT false,
	-- Last successful exchange with the sync peer. Null for a device that has only ever worked offline, which is a supported state, not an error.
	"last_sync_at" TIMESTAMP,
	-- First launch on this device.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id")
);

/* Self-referencing notebook tree. Notes belong to at most one notebook; everything cross-cutting is done with tags and links, so the tree can stay shallow. */
CREATE TABLE IF NOT EXISTS "notebooks" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Cross-device identity. Generated offline, so notebooks created on a plane merge cleanly rather than fighting over an autoincrement.
	"notebook_uuid" TEXT NOT NULL UNIQUE,
	-- Containing notebook, for stacks. Null for a top-level notebook.
	"parent_id" INTEGER,
	-- Display name. Unique among siblings only, enforced by the composite index.
	"name" TEXT NOT NULL,
	-- Emoji or icon name shown in the sidebar.
	"icon" TEXT,
	-- Manual sort order among siblings, so the sidebar does not reshuffle when a notebook is renamed.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- Hides the notebook and its notes from search and the sidebar without deleting anything.
	"is_archived" BOOLEAN NOT NULL DEFAULT false,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Last rename or move.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("parent_id") REFERENCES "notebooks"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_notebooks_parent_name"
ON "notebooks" ("parent_id", "name");
/* A single document. The body stays one text column on purpose - block-level tables buy collaborative editing at the cost of every simple read, and a single-user local database does not need that trade. */
CREATE TABLE IF NOT EXISTS "notes" (
	-- Surrogate primary key, and the rowid the FTS index joins against.
	"id" INTEGER,
	-- Cross-device identity, generated on the device. The sync protocol never refers to the local integer id.
	"note_uuid" TEXT NOT NULL UNIQUE,
	-- Containing notebook. Null for an inbox note that has not been filed yet.
	"notebook_id" INTEGER,
	-- First heading or first line. Stored separately from the body because wiki links resolve against it and a blank title is normal for a new note.
	"title" TEXT NOT NULL,
	-- Lowercased, whitespace-collapsed title. What note_links matches on, so "My Note" and "my  note" are the same target.
	"title_normalized" TEXT NOT NULL,
	-- Full Markdown source. Kept as one column rather than a block tree because the file is local: reading 200 KB of text costs microseconds and there is no network in the way.
	"body" TEXT NOT NULL,
	-- Hash of the body at last save. Lets sync skip a note whose mtime changed but whose content did not.
	"body_hash" TEXT NOT NULL,
	-- Maintained on save for the note list. Cheap here precisely because the write path is single-process.
	"word_count" INTEGER NOT NULL DEFAULT 0,
	-- Sticks the note to the top of its list.
	"is_pinned" BOOLEAN NOT NULL DEFAULT false,
	-- True when the body column holds ciphertext for a locked note. Such notes are excluded from the FTS index, which is the honest cost of per-note encryption.
	"is_encrypted" BOOLEAN NOT NULL DEFAULT false,
	-- Soft-delete marker. Hard deletes are unsafe in a syncing system: a peer that has not seen the delete would simply recreate the row.
	"deleted_at" TIMESTAMP,
	-- Creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Last edit on this device. Used for display; sync compares revision clocks, not this column.
	"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_notes_notebook_updated"
ON "notes" ("notebook_id", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_notes_title_normalized"
ON "notes" ("title_normalized");

CREATE INDEX IF NOT EXISTS "idx_notes_deleted"
ON "notes" ("deleted_at");
/* The parsed link graph, rebuilt from the body on every save. It is derived data, so it can always be thrown away and recomputed - and a backlinks panel becomes one indexed lookup instead of a full-text scan for "[[this note]]". */
CREATE TABLE IF NOT EXISTS "note_links" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Note whose body contains the link.
	"source_note_id" INTEGER NOT NULL,
	-- Resolved destination. Null when no note with that title exists yet - the link is still recorded, and resolves the moment someone creates the note.
	"target_note_id" INTEGER,
	-- Normalised title the link points at. This, not the id, is what the link actually means, which is why renaming a note breaks or repairs links in bulk.
	"target_title_normalized" TEXT NOT NULL,
	-- Display alias when the link was written as [[target|alias]]. Null when it matches the target.
	"link_text" TEXT,
	-- Position in the body, so a backlink panel can quote the surrounding sentence without re-parsing the whole note.
	"char_offset" INTEGER NOT NULL DEFAULT 0,
	-- True for transclusions, which render the target inline rather than as a link.
	"is_embed" BOOLEAN NOT NULL DEFAULT false,
	PRIMARY KEY("id"),
	FOREIGN KEY ("source_note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("target_note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_links_source_offset"
ON "note_links" ("source_note_id", "char_offset");

CREATE INDEX IF NOT EXISTS "idx_links_target"
ON "note_links" ("target_note_id");

CREATE INDEX IF NOT EXISTS "idx_links_target_title"
ON "note_links" ("target_title_normalized");
/* Tags are extracted from note bodies and from explicit assignment, and both paths land here. Keeping them as rows rather than a delimited string is what makes renaming a tag a single UPDATE. */
CREATE TABLE IF NOT EXISTS "tags" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Tag text without the leading hash. Unique globally, because a tag namespace per notebook is a feature nobody asks for twice.
	"name" TEXT NOT NULL UNIQUE,
	-- Hex swatch for the sidebar.
	"color" TEXT,
	-- Parent tag, for hierarchies like project/alpha. Null for a top-level tag.
	"parent_id" INTEGER,
	-- Cached number of live notes carrying this tag, for the tag list. Recomputed on demand because a full recount is milliseconds on a personal-scale database.
	"usage_count" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("parent_id") REFERENCES "tags"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

/* Join table with no surrogate id. The source column matters: a rebuild after an edit deletes and re-inserts inline rows, and would silently destroy manual assignments without it. */
CREATE TABLE IF NOT EXISTS "note_tags" (
	-- Tagged note. Part of the composite key.
	"note_id" INTEGER,
	-- Applied tag. Part of the composite key, which also stops a tag being applied twice.
	"tag_id" INTEGER,
	-- inline | manual. Inline tags are re-derived from the body on save; manual ones must survive that rebuild.
	"source" TEXT NOT NULL DEFAULT 'inline',
	PRIMARY KEY("note_id", "tag_id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Attachments split at a size threshold: small ones inline as a BLOB, large ones as files on disk. The split exists because a database file that grows to gigabytes makes every backup and every sync slow. */
CREATE TABLE IF NOT EXISTS "attachments" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Note the file is attached to.
	"note_id" INTEGER NOT NULL,
	-- Original filename as the user saw it.
	"filename" TEXT NOT NULL,
	-- Type sniffed at import, used to choose a preview.
	"mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
	-- File size, shown in the UI and used to warn before a large sync.
	"size_bytes" INTEGER NOT NULL,
	-- SHA-256 of the bytes. Two notes attaching the same image point at the same file on disk instead of storing it twice.
	"content_hash" TEXT NOT NULL,
	-- Path relative to the attachments directory. Null when the bytes live in inline_data instead.
	"storage_path" TEXT,
	-- The file itself, for small attachments. Under a few dozen KB it is cheaper to keep bytes in the database than to manage a second file whose lifetime must be kept in sync with a row.
	"inline_data" BLOB,
	-- Import time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_attachments_note"
ON "attachments" ("note_id");

CREATE INDEX IF NOT EXISTS "idx_attachments_hash"
ON "attachments" ("content_hash");
/* The full-text index, one row per searchable note. Encrypted notes are deliberately absent - you cannot index what you cannot read, and pretending otherwise is how search leaks the contents of locked notes. */
CREATE TABLE IF NOT EXISTS "note_search" (
	-- Matches notes.id. In the real DDL this table is an FTS5 virtual table whose rowid is the note id; it is modelled as a plain table here so the diagram shows the join.
	"note_id" INTEGER,
	-- Tokenised copy of the title, weighted higher than the body when ranking.
	"title" TEXT NOT NULL,
	-- Tokenised copy of the body with Markdown syntax stripped, so a search for "link" does not match every URL.
	"body" TEXT NOT NULL,
	-- When this row was last rebuilt. A trigger on notes keeps it current; this column is what an integrity check compares against notes.updated_at.
	"indexed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("note_id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Append-only history and the sync outbox in one table. Every edit is a row, so version history, offline queueing and conflict evidence all read from the same place instead of three parallel logs. */
CREATE TABLE IF NOT EXISTS "note_revisions" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Note this revision belongs to.
	"note_id" INTEGER NOT NULL,
	-- Device that wrote it. Null for a revision received from a peer that has since been unlinked.
	"device_id" INTEGER,
	-- Hybrid logical clock: max(local counter, highest seen from peers) + 1. Ordering revisions by wall clock across devices is how notes silently lose edits.
	"revision_clock" INTEGER NOT NULL DEFAULT 0,
	-- Title at this revision.
	"title" TEXT NOT NULL,
	-- Full body at this revision. Snapshots rather than diffs, because restoring has to be instant and a personal note is small.
	"body" TEXT NOT NULL,
	-- Hash of this body, so an identical re-save does not append a revision.
	"body_hash" TEXT NOT NULL,
	-- False until the revision has been accepted by the sync peer. The set of unsynced revisions is exactly what an offline device owes the network.
	"is_synced" BOOLEAN NOT NULL DEFAULT false,
	-- When the revision was written on its originating device.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("device_id") REFERENCES "devices"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_revisions_note_clock"
ON "note_revisions" ("note_id", "revision_clock");

CREATE INDEX IF NOT EXISTS "idx_revisions_unsynced"
ON "note_revisions" ("is_synced");
/* Per-note sync bookkeeping, kept apart from notes so a sync attempt never writes to the row the editor is holding. That separation is what lets background sync run while the user types. */
CREATE TABLE IF NOT EXISTS "sync_state" (
	-- Note this state belongs to. One row per note, so the note id is the primary key.
	"note_id" INTEGER,
	-- Highest revision_clock written locally for this note.
	"local_clock" INTEGER NOT NULL DEFAULT 0,
	-- Highest revision_clock the peer has acknowledged. The gap between the two is the pending work for this note.
	"remote_clock" INTEGER NOT NULL DEFAULT 0,
	-- Revision the peer last confirmed. Null for a note that has never left the device.
	"last_synced_revision_id" INTEGER,
	-- Set on every local write, cleared on acknowledgement. A boolean beats scanning timestamps because it survives a clock that jumps backwards.
	"is_dirty" BOOLEAN NOT NULL DEFAULT false,
	-- Last sync failure for this note, kept per note rather than globally so one poisoned note cannot stall the whole queue.
	"last_error" TEXT,
	-- When sync last tried, for exponential backoff.
	"last_attempt_at" TIMESTAMP,
	PRIMARY KEY("note_id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("last_synced_revision_id") REFERENCES "note_revisions"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_sync_state_dirty"
ON "sync_state" ("is_dirty");
/* The receipt for every automatic overwrite. Last-writer-wins is a reasonable default only if the loser is preserved and the user is told; this table is what makes that promise keepable. */
CREATE TABLE IF NOT EXISTS "sync_conflicts" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Note two devices edited concurrently.
	"note_id" INTEGER NOT NULL,
	-- Revision that was kept. Null if the loser was later promoted by the user.
	"winning_revision_id" INTEGER,
	-- Revision that lost. Never deleted - last-writer-wins is only acceptable because the loser is still recoverable from here.
	"losing_revision_id" INTEGER,
	-- Device whose write survived, so the UI can say "your phone overwrote your laptop" rather than "a conflict occurred".
	"winning_device_id" INTEGER,
	-- last_writer_wins | manual | duplicated. Records how it was settled, not just that it was.
	"resolution" TEXT NOT NULL DEFAULT 'last_writer_wins',
	-- When the user acknowledged it. Null while the conflict banner is still showing.
	"resolved_at" TIMESTAMP,
	-- When the divergence was noticed during a merge.
	"detected_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("note_id") REFERENCES "notes"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("winning_revision_id") REFERENCES "note_revisions"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("losing_revision_id") REFERENCES "note_revisions"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("winning_device_id") REFERENCES "devices"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_conflicts_note_time"
ON "sync_conflicts" ("note_id", "detected_at");

CREATE INDEX IF NOT EXISTS "idx_conflicts_unresolved"
ON "sync_conflicts" ("resolved_at");
