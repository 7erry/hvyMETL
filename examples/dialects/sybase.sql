-- sybase dialect example — computed pattern: account balances and counters maintained at write time.

CREATE TABLE dbo.accounts (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  account_number VARCHAR(40) NOT NULL,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0
);
CREATE TABLE dbo.ledger_entries (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  account_id INT NOT NULL REFERENCES accounts(id),
  amount NUMERIC(14,2) NOT NULL,
  posted_at DATETIME NOT NULL
);
