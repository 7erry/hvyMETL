/* A place money sits. Every transaction belongs to exactly one account, which is what makes a balance a simple sum and a reconciliation against a bank statement possible at all. */
CREATE TABLE IF NOT EXISTS "accounts" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- What the user calls it, e.g. "Joint current account".
	"name" TEXT NOT NULL,
	-- checking | savings | credit_card | cash | investment | loan. Decides the sign convention the UI shows: a positive balance on a credit card is a debt.
	"kind" TEXT NOT NULL DEFAULT 'checking',
	-- ISO 4217 code for every amount on this account. Accounts are single-currency on purpose; a multi-currency account is two accounts.
	"currency_code" TEXT NOT NULL DEFAULT 'USD',
	-- Balance before the first recorded transaction, in minor units. Without it, importing six months of statements shows a balance that is wrong by whatever came before.
	"opening_balance_minor" INTEGER NOT NULL DEFAULT 0,
	-- Cached running balance. Maintained on write and rebuilt from the transaction table on demand, because a personal ledger is small enough to re-sum in milliseconds.
	"current_balance_minor" INTEGER NOT NULL DEFAULT 0,
	-- Bank or provider name, used to pick an icon and to group the account list.
	"institution" TEXT,
	-- Hides the account without deleting its history. Deleting an account would orphan years of categorised spending.
	"is_closed" BOOLEAN NOT NULL DEFAULT false,
	-- Excludes the account from budget maths - investment and loan accounts move money without it being spending.
	"is_off_budget" BOOLEAN NOT NULL DEFAULT false,
	-- Manual sort order in the sidebar.
	"position" INTEGER NOT NULL DEFAULT 0,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id")
);

/* Self-referencing category tree, two levels in practice. Budgets attach to leaves and reports roll up to parents, so the depth of the tree is the depth of the reporting. */
CREATE TABLE IF NOT EXISTS "categories" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Parent category. Null for a top-level group such as Housing or Food.
	"parent_id" INTEGER,
	-- Display name, e.g. Groceries under Food.
	"name" TEXT NOT NULL,
	-- expense | income. Kept explicit rather than inferred from amount sign, so a refund into an expense category still reports as an expense.
	"kind" TEXT NOT NULL DEFAULT 'expense',
	-- Icon name shown in the picker.
	"icon" TEXT,
	-- Retires a category while leaving historical transactions categorised.
	"is_archived" BOOLEAN NOT NULL DEFAULT false,
	-- Manual sort order among siblings.
	"position" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("parent_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_parent_name"
ON "categories" ("parent_id", "name");
/* Normalised merchants. Statement descriptors are noisy and unstable; mapping them to one payee row is what makes "how much do I spend at the supermarket?" answerable. */
CREATE TABLE IF NOT EXISTS "payees" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Cleaned-up merchant name, e.g. "Tesco" rather than "TESCO STORES 3421 LONDON".
	"name" TEXT NOT NULL UNIQUE,
	-- Category applied automatically to new transactions for this payee. Null until a pattern is obvious.
	"default_category_id" INTEGER,
	-- Marks a payee that represents the user own accounts, so a transfer is not mistaken for a merchant.
	"is_internal" BOOLEAN NOT NULL DEFAULT false,
	-- Cached usage count, used to order the payee autocomplete by how often it is actually picked.
	"transaction_count" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("default_category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

/* The ledger. One row is one movement on one account, so a transfer between two accounts is two rows - and every report has to know that, which is what kind and transfer_id are for. */
CREATE TABLE IF NOT EXISTS "transactions" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Account the money moved on.
	"account_id" INTEGER NOT NULL,
	-- Category assigned. Null for an uncategorised import awaiting review, and always null on a transfer leg.
	"category_id" INTEGER,
	-- Normalised merchant. Null for cash entries typed by hand.
	"payee_id" INTEGER,
	-- Set on both legs of a transfer, null on everything else. This one column is how reports exclude internal movement.
	"transfer_id" INTEGER,
	-- Rule that generated this row, if any. Lets a user edit a series and see which entries came from it.
	"recurring_rule_id" INTEGER,
	-- Statement import that created it. Null for manual entries.
	"import_batch_id" INTEGER,
	-- Date the transaction counts for in budgets and reports. A DATE because personal finance is a calendar activity; the time of a coffee is not a fact anyone needs.
	"posted_on" DATE NOT NULL,
	-- Signed amount in minor units - negative for money out, positive for money in. Integers only: a budget that drifts by a cent a month because of floating point is a budget nobody trusts.
	"amount_minor" INTEGER NOT NULL,
	-- ISO 4217 code, copied from the account. Denormalised so a report never has to join to know what a number means.
	"currency_code" TEXT NOT NULL DEFAULT 'USD',
	-- expense | income | transfer. A transfer is neither of the other two, which is precisely why it needs its own value rather than a clever sign convention.
	"kind" TEXT NOT NULL DEFAULT 'expense',
	-- Raw statement descriptor or the user note. Kept verbatim so import rules can be re-run against it later.
	"description" TEXT,
	-- Free text the user added after the fact.
	"notes" TEXT,
	-- Confirmed against the bank statement. Pending card authorisations are uncleared and can still change amount.
	"is_cleared" BOOLEAN NOT NULL DEFAULT false,
	-- Locked as part of a reconciled statement period. A reconciled row should not be silently edited, which is a stronger claim than cleared.
	"is_reconciled" BOOLEAN NOT NULL DEFAULT false,
	-- Bank-provided identifier. Null for manual entries.
	"external_id" TEXT,
	-- Hash of date, amount and descriptor, used to recognise a row that has already been imported. The dedup key when the bank supplies no stable id, which is most of the time.
	"import_hash" TEXT,
	-- When the row entered the database, which is often long after posted_on.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("payee_id") REFERENCES "payees"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("recurring_rule_id") REFERENCES "recurring_rules"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_transactions_account_date"
ON "transactions" ("account_id", "posted_on");

CREATE INDEX IF NOT EXISTS "idx_transactions_category_date"
ON "transactions" ("category_id", "posted_on");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_transactions_account_import_hash"
ON "transactions" ("account_id", "import_hash");

CREATE INDEX IF NOT EXISTS "idx_transactions_transfer"
ON "transactions" ("transfer_id");
/* A transfer between the user own accounts, modelled as one row linking two transaction legs. It is the single most misdesigned thing in personal finance apps: moving 500 from savings to current is not income and not spending, and counting it as either doubles a month totals. */
CREATE TABLE IF NOT EXISTS "transfers" (
	-- Surrogate primary key. The pairing itself is the entity.
	"id" INTEGER,
	-- The outflow leg, with a negative amount. Null only during the instant both legs are being inserted.
	"from_transaction_id" INTEGER,
	-- The inflow leg, with a positive amount.
	"to_transaction_id" INTEGER,
	-- Amount leaving the source account, in its own currency and minor units.
	"from_amount_minor" INTEGER NOT NULL,
	-- Amount arriving at the destination. Differs from from_amount_minor across currencies or when a wire fee is taken in transit.
	"to_amount_minor" INTEGER NOT NULL,
	-- Rate applied when the two legs are in different currencies. Null for a same-currency transfer. REAL is acceptable here because it is a stored quotation, not a value being summed.
	"exchange_rate" REAL,
	-- Cost of moving the money. Unlike the transfer itself this is a real expense and is reported as one.
	"fee_minor" INTEGER NOT NULL DEFAULT 0,
	-- Date of the movement. Both legs normally share it; a cross-bank transfer may post a day apart and the legs keep their own dates.
	"transferred_on" DATE NOT NULL,
	-- Row creation time.
	"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("from_transaction_id") REFERENCES "transactions"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("to_transaction_id") REFERENCES "transactions"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_transfers_date"
ON "transfers" ("transferred_on");
/* The intent to spend at most X on a category per period. It holds the template; what actually happened in a given month belongs to budget_periods. */
CREATE TABLE IF NOT EXISTS "budgets" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Category being budgeted. Budgets attach to leaves; parents are reported as the sum of their children.
	"category_id" INTEGER NOT NULL,
	-- Optional label, for when one category carries several budgets over time.
	"name" TEXT,
	-- monthly | weekly | yearly. The period shape, not the period itself - the periods live in their own table.
	"period_kind" TEXT NOT NULL DEFAULT 'monthly',
	-- Default allocation per period, in minor units. Copied into each new budget_periods row rather than read live, so changing next month plan does not rewrite last month.
	"amount_minor" INTEGER NOT NULL,
	-- ISO 4217 code for amount_minor.
	"currency_code" TEXT NOT NULL DEFAULT 'USD',
	-- Carries an unspent remainder into the next period. Turning this on changes what "over budget" means, so it is a per-budget decision rather than a global setting.
	"rollover_enabled" BOOLEAN NOT NULL DEFAULT false,
	-- First period this budget covers.
	"starts_on" DATE NOT NULL,
	-- Last period covered. Null for an ongoing budget.
	"ends_on" DATE,
	PRIMARY KEY("id"),
	FOREIGN KEY ("category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_budgets_category_start"
ON "budgets" ("category_id", "starts_on");
/* One row per budget per period. This is what makes rollover, a mid-year allocation change and a year-over-year comparison all simple reads instead of recomputations from the budget template. */
CREATE TABLE IF NOT EXISTS "budget_periods" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Budget this period belongs to.
	"budget_id" INTEGER NOT NULL,
	-- First day of the period, inclusive.
	"period_start" DATE NOT NULL,
	-- Last day of the period, inclusive. Stored rather than computed so a changed period_kind cannot reshape history.
	"period_end" DATE NOT NULL,
	-- Amount budgeted for this specific period, snapshotted from the budget. Editing one month allocation is then a local change.
	"allocated_minor" INTEGER NOT NULL,
	-- Surplus or deficit carried in from the previous period. Stored explicitly so the chain is auditable instead of being recomputed from the beginning of time.
	"rolled_over_minor" INTEGER NOT NULL DEFAULT 0,
	-- Cached sum of matching transactions. Derived and rebuildable; it exists so the budget screen does not aggregate the whole ledger on every render.
	"spent_minor" INTEGER NOT NULL DEFAULT 0,
	-- Freezes the period once its rollover has been applied forward, so a late back-dated transaction is flagged rather than silently changing a closed month.
	"is_closed" BOOLEAN NOT NULL DEFAULT false,
	PRIMARY KEY("id"),
	FOREIGN KEY ("budget_id") REFERENCES "budgets"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_budget_periods_budget_start"
ON "budget_periods" ("budget_id", "period_start");
/* Expected future money. Kept separate from transactions because a forecast is not a fact - the row in the ledger only appears when the charge is generated or matched. */
CREATE TABLE IF NOT EXISTS "recurring_rules" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Account the generated transactions land on.
	"account_id" INTEGER NOT NULL,
	-- Category applied to generated rows. Null if the user wants to categorise each one.
	"category_id" INTEGER,
	-- Merchant for generated rows.
	"payee_id" INTEGER,
	-- Label for the series, e.g. "Rent" or "Gym membership".
	"name" TEXT NOT NULL,
	-- Expected signed amount in minor units. The generated row is editable, because the real charge often differs by a few cents.
	"amount_minor" INTEGER NOT NULL,
	-- weekly | biweekly | monthly | quarterly | yearly.
	"frequency" TEXT NOT NULL DEFAULT 'monthly',
	-- Day the charge lands for monthly-style frequencies. 31 is clamped to the month length rather than skipping February.
	"day_of_month" INTEGER,
	-- Next occurrence to generate. Advanced after each generation, so the rule is a cursor and not a schedule to be recomputed.
	"next_due_on" DATE NOT NULL,
	-- Last occurrence. Null for an open-ended subscription.
	"ends_on" DATE,
	-- True generates the transaction automatically; false only raises a reminder. Auto-posting a charge that never arrives is how a ledger stops matching the bank.
	"auto_post" BOOLEAN NOT NULL DEFAULT false,
	-- Pauses the rule without deleting it or its generated history.
	"is_active" BOOLEAN NOT NULL DEFAULT true,
	PRIMARY KEY("id"),
	FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
	ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY ("category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("payee_id") REFERENCES "payees"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_recurring_active_due"
ON "recurring_rules" ("is_active", "next_due_on");
/* One row per statement import. It exists so an import can be reviewed and, if a mapping was wrong, undone as a unit rather than transaction by transaction. */
CREATE TABLE IF NOT EXISTS "import_batches" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Account the statement belongs to.
	"account_id" INTEGER NOT NULL,
	-- csv | ofx | qif | api. Records how the data arrived, which matters when a format turns out to have been misparsed.
	"source" TEXT NOT NULL DEFAULT 'csv',
	-- Original file name, so a user can tell two imports apart.
	"filename" TEXT,
	-- Rows found in the file.
	"row_count" INTEGER NOT NULL DEFAULT 0,
	-- Rows that became transactions.
	"imported_count" INTEGER NOT NULL DEFAULT 0,
	-- Rows rejected by the import_hash uniqueness check. Shown to the user, because a silent skip looks like data loss.
	"duplicate_count" INTEGER NOT NULL DEFAULT 0,
	-- Earliest posted_on in the file, for detecting gaps between statements.
	"period_start" DATE,
	-- Latest posted_on in the file.
	"period_end" DATE,
	-- When the import ran.
	"imported_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

/* Auto-categorisation rules applied at import time. They write a category onto the transaction rather than being consulted at read time, so a later rule change never rewrites what the user has already reviewed and corrected. */
CREATE TABLE IF NOT EXISTS "import_rules" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- description | payee | amount. Which part of the incoming row the pattern is tested against.
	"match_field" TEXT NOT NULL DEFAULT 'description',
	-- contains | starts_with | regex | equals.
	"match_type" TEXT NOT NULL DEFAULT 'contains',
	-- The text or expression to match, e.g. "TESCO STORES". Matched against the raw descriptor, which is why transactions keeps it verbatim.
	"pattern" TEXT NOT NULL,
	-- Category to apply on a match. Null to leave categorisation alone.
	"set_category_id" INTEGER,
	-- Payee to apply on a match, which is how a noisy descriptor becomes a clean merchant name.
	"set_payee_id" INTEGER,
	-- Lower runs first. Rules are evaluated in order and the first match wins, so a specific rule can sit in front of a general one.
	"priority" INTEGER NOT NULL DEFAULT 100,
	-- Disables a rule without losing it.
	"is_enabled" BOOLEAN NOT NULL DEFAULT true,
	-- How often the rule has fired, so a rule that never matches can be found and fixed.
	"match_count" INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("id"),
	FOREIGN KEY ("set_category_id") REFERENCES "categories"("id")
	ON UPDATE CASCADE ON DELETE SET NULL,
	FOREIGN KEY ("set_payee_id") REFERENCES "payees"("id")
	ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_import_rules_enabled_priority"
ON "import_rules" ("is_enabled", "priority");
/* Proof attached to a transaction. Receipts are the reason a personal finance file is worth backing up, so the small ones live inside the database rather than beside it. */
CREATE TABLE IF NOT EXISTS "receipts" (
	-- Surrogate primary key.
	"id" INTEGER,
	-- Transaction the receipt documents.
	"transaction_id" INTEGER NOT NULL,
	-- Original file name as captured or uploaded.
	"filename" TEXT NOT NULL,
	-- Type of the stored bytes, used to pick a viewer.
	"mime_type" TEXT NOT NULL DEFAULT 'image/jpeg',
	-- File size, for the storage summary.
	"size_bytes" INTEGER NOT NULL,
	-- Path on disk for a large scan. Null when the bytes are inline.
	"storage_path" TEXT,
	-- The image itself, for small captures. Inlining keeps a single-file backup genuinely complete, which is the whole appeal of a local database.
	"image_data" BLOB,
	-- Extracted text, indexed for search. Null until OCR runs, which happens on the device and may never happen at all.
	"ocr_text" TEXT,
	-- When the receipt was attached.
	"captured_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id"),
	FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
	ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_receipts_transaction"
ON "receipts" ("transaction_id");
