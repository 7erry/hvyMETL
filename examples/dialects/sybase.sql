-- sybase dialect example — computed pattern: ledger accounts with running balances and posting audit tables.

CREATE TABLE dbo.legal_entities (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  legal_name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(40) NOT NULL,
  country CHAR(2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE dbo.accounts (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  entity_id INT NOT NULL REFERENCES legal_entities(id),
  account_number VARCHAR(40) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  opened_at DATETIME NOT NULL
);
CREATE TABLE dbo.posting_batches (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  entity_id INT NOT NULL REFERENCES legal_entities(id),
  batch_ref VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  submitted_at DATETIME NOT NULL,
  posted_at DATETIME
);
CREATE TABLE dbo.ledger_entries (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  account_id INT NOT NULL REFERENCES accounts(id),
  batch_id INT NOT NULL REFERENCES posting_batches(id),
  amount NUMERIC(14,2) NOT NULL,
  posting_type VARCHAR(10) NOT NULL,
  memo VARCHAR(255),
  posted_at DATETIME NOT NULL
);
CREATE TABLE dbo.account_daily_snapshots (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  account_id INT NOT NULL REFERENCES accounts(id),
  snapshot_date DATE NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL,
  closing_balance NUMERIC(14,2) NOT NULL
);
CREATE TABLE dbo.audit_events (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  entity_id INT NOT NULL REFERENCES legal_entities(id),
  actor VARCHAR(120) NOT NULL,
  action VARCHAR(60) NOT NULL,
  occurred_at DATETIME NOT NULL,
  details TEXT
);
