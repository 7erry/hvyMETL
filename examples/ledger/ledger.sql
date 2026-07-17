-- Enterprise Financial Ledger: multi-currency, double-entry, partitioned journal.
-- Demonstrates: Financial Ledger profile, journal line embedding, computed balances,
-- schema versioning, reference-first posting integrity, audit trail separation.

-- ============================================================================
-- ENTERPRISE FINANCIAL LEDGER SCHEMA (DDL)
-- Dialect: PostgreSQL 13+
-- Architecture: Multi-Currency, Double-Entry, Partitioned Ledger
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ENUMS & REFERENCE TYPES
-- ----------------------------------------------------------------------------

CREATE TYPE account_class AS ENUM (
    'ASSET', 
    'LIABILITY', 
    'EQUITY', 
    'REVENUE', 
    'EXPENSE'
);

CREATE TYPE account_status AS ENUM (
    'PENDING', 
    'ACTIVE', 
    'SUSPENDED', 
    'CLOSED'
);

CREATE TYPE entry_status AS ENUM (
    'DRAFT', 
    'PENDING_APPROVAL', 
    'POSTED', 
    'REJECTED', 
    'REVERSED'
);

CREATE TYPE posting_type AS ENUM (
    'DEBIT', 
    'CREDIT'
);

-- ----------------------------------------------------------------------------
-- 2. CORE REFERENCE TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE currencies (
    currency_code CHAR(3) PRIMARY KEY,
    currency_name VARCHAR(50) NOT NULL,
    numeric_code CHAR(3) NOT NULL,
    exponent INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fx_rates (
    fx_rate_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    to_currency CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    rate NUMERIC(18, 8) NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_fx_rate_positive CHECK (rate > 0),
    CONSTRAINT chk_fx_different_currencies CHECK (from_currency <> to_currency)
);

-- ----------------------------------------------------------------------------
-- 3. CUSTOMER & ENTITY TOPOLOGY
-- ----------------------------------------------------------------------------

CREATE TABLE legal_entities (
    entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    tax_identifier VARCHAR(50) UNIQUE NOT NULL,
    country_of_incorporation CHAR(2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES legal_entities(entity_id),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    risk_rating INT NOT NULL DEFAULT 1 CONSTRAINT chk_risk_rating CHECK (risk_rating BETWEEN 1 AND 5),
    is_kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. CHART OF ACCOUNTS (CoA)
-- ----------------------------------------------------------------------------

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES legal_entities(entity_id),
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_class account_class NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    parent_account_id UUID REFERENCES accounts(account_id),
    status account_status NOT NULL DEFAULT 'PENDING',
    is_reconcilable BOOLEAN NOT NULL DEFAULT TRUE,
    current_balance NUMERIC(20, 4) NOT NULL DEFAULT 0.0000,
    cleared_balance NUMERIC(20, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_account_num UNIQUE (entity_id, account_number)
);

-- ----------------------------------------------------------------------------
-- 5. TRANSACTIONAL JOURNAL LAYER (Double-Entry Headers)
-- ----------------------------------------------------------------------------

CREATE TABLE journal_entries (
    journal_entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES legal_entities(entity_id),
    reference_number VARCHAR(100) NOT NULL,
    narration TEXT NOT NULL,
    status entry_status NOT NULL DEFAULT 'DRAFT',
    posted_at TIMESTAMPTZ,
    source_system VARCHAR(50) NOT NULL DEFAULT 'CORE_LEDGER',
    created_by UUID NOT NULL, -- References internal system/user auth service ID
    approved_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_journal_ref_per_entity UNIQUE (entity_id, reference_number)
);

-- ----------------------------------------------------------------------------
-- 6. PARTITIONED TRANSACTION LINE ITEMS
--    Heavy volume table partitioned by range (Quarterly for 2026 as example)
-- ----------------------------------------------------------------------------

CREATE TABLE journal_lines (
    journal_line_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(journal_entry_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    entry_type posting_type NOT NULL,
    amount NUMERIC(20, 4) NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(currency_code),
    historical_fx_rate NUMERIC(18, 8) NOT NULL DEFAULT 1.00000000,
    base_amount NUMERIC(20, 4) GENERATED ALWAYS AS (amount * historical_fx_rate) STORED,
    reconciliation_status BOOLEAN NOT NULL DEFAULT FALSE,
    value_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_positive_line_amount CHECK (amount > 0),
    PRIMARY KEY (journal_line_id, value_date)
) PARTITION BY RANGE (value_date);

-- Example Partitions for high-performance handling
CREATE TABLE journal_lines_2026_q1 PARTITION OF journal_lines
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE journal_lines_2026_q2 PARTITION OF journal_lines
    FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE journal_lines_2026_q3 PARTITION OF journal_lines
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE journal_lines_2026_q4 PARTITION OF journal_lines
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- ----------------------------------------------------------------------------
-- 7. AUDITING & COMPLIANCE LOGS
-- ----------------------------------------------------------------------------

CREATE TABLE audit_logs (
    audit_id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action_type VARCHAR(10) NOT NULL CONSTRAINT chk_action CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    old_state JSONB,
    new_state JSONB,
    changed_by UUID NOT NULL,
    client_ip VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 8. PERFORMANCE & COMPLIANCE INDEXES
-- ----------------------------------------------------------------------------

-- Indexes on partitioned ledger for rapid financial reporting
CREATE INDEX idx_journal_lines_account_date ON journal_lines(account_id, value_date);
CREATE INDEX idx_journal_lines_entry_id ON journal_lines(journal_entry_id);

-- Speed up Chart of Accounts lookups
CREATE INDEX idx_accounts_entity_class ON accounts(entity_id, account_class);
CREATE UNIQUE INDEX idx_active_fx_lookup ON fx_rates(from_currency, to_currency) WHERE (effective_to IS NULL);

-- Audit query indexing
CREATE INDEX idx_audit_record ON audit_logs(table_name, record_id);

-- ----------------------------------------------------------------------------
-- 9. REPORTING & ANALYTICAL VIEWS
-- ----------------------------------------------------------------------------

-- Real-time Trial Balance representation checking that Total Debits == Total Credits
CREATE OR REPLACE VIEW view_trial_balance AS
SELECT 
    a.entity_id,
    a.account_class,
    a.account_number,
    a.account_name,
    SUM(CASE WHEN jl.entry_type = 'DEBIT' THEN jl.base_amount ELSE 0 END) AS total_debit_base,
    SUM(CASE WHEN jl.entry_type = 'CREDIT' THEN jl.base_amount ELSE 0 END) AS total_credit_base,
    (SUM(CASE WHEN jl.entry_type = 'DEBIT' THEN jl.base_amount ELSE 0 END) - 
     SUM(CASE WHEN jl.entry_type = 'CREDIT' THEN jl.base_amount ELSE 0 END)) AS net_balance_base
FROM accounts a
JOIN journal_lines jl ON a.account_id = jl.account_id
JOIN journal_entries je ON jl.journal_entry_id = je.journal_entry_id
WHERE je.status = 'POSTED'
GROUP BY a.entity_id, a.account_class, a.account_number, a.account_name;
