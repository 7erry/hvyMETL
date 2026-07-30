-- spanner dialect example — computed pattern: ledger accounts with running balances and posting audit tables.

CREATE TABLE legal_entities (
  id INT64 NOT NULL,

    legal_name STRING(255) NOT NULL,
  tax_id STRING(40) NOT NULL,
  country CHAR(2) NOT NULL,
  is_active BOOL NOT NULL DEFAULT 1

) PRIMARY KEY (id);
CREATE TABLE accounts (
  id INT64 NOT NULL,

    entity_id INT64 NOT NULL REFERENCES legal_entities(id),
  account_number STRING(40) NOT NULL,
  account_name STRING(160) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  current_balance NUMERIC NOT NULL DEFAULT 0,
  transaction_count INT64 NOT NULL DEFAULT 0,
  opened_at TIMESTAMP NOT NULL

) PRIMARY KEY (id);
CREATE TABLE posting_batches (
  id INT64 NOT NULL,

    entity_id INT64 NOT NULL REFERENCES legal_entities(id),
  batch_ref STRING(40) NOT NULL,
  status STRING(20) NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  posted_at TIMESTAMP

) PRIMARY KEY (id);
CREATE TABLE ledger_entries (
  id INT64 NOT NULL,

    account_id INT64 NOT NULL REFERENCES accounts(id),
  batch_id INT64 NOT NULL REFERENCES posting_batches(id),
  amount NUMERIC NOT NULL,
  posting_type STRING(10) NOT NULL,
  memo STRING(255),
  posted_at TIMESTAMP NOT NULL

) PRIMARY KEY (id);
CREATE TABLE account_daily_snapshots (
  id INT64 NOT NULL,

    account_id INT64 NOT NULL REFERENCES accounts(id),
  snapshot_date DATE NOT NULL,
  opening_balance NUMERIC NOT NULL,
  closing_balance NUMERIC NOT NULL

) PRIMARY KEY (id);
CREATE TABLE audit_events (
  id INT64 NOT NULL,

    entity_id INT64 NOT NULL REFERENCES legal_entities(id),
  actor STRING(120) NOT NULL,
  action STRING(60) NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  details STRING(MAX)

) PRIMARY KEY (id);
