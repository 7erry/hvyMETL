import { describe, expect, it } from 'vitest';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { buildMigrationPlan } from './patternSelector.js';
import { getProfile } from '../profiles/profiles.js';
import { explainTransformation } from './explainTransformation.js';

const BANKING_DDL = `
CREATE TABLE customers (
    id INT PRIMARY KEY,
    first_name VARCHAR(255) NULL,
    last_name VARCHAR(255) NULL
);
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    customer_id INT NULL,
    type ENUM('CHECKING', 'SAVINGS') NULL,
    balance FLOAT NULL,
    CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE transactions (
    id INT PRIMARY KEY,
    account_id INT NULL,
    time DATETIME NULL,
    amount FLOAT NULL,
    CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE TABLE transfers (
    id INT PRIMARY KEY,
    \`from\` INT NULL,
    \`to\` INT NULL,
    time DATETIME NULL,
    CONSTRAINT fk_transfers_from FOREIGN KEY (\`from\`) REFERENCES accounts(id)
);
CREATE TABLE investments (
    id INT PRIMARY KEY,
    customer_id INT NULL,
    CONSTRAINT fk_investments_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE loans (
    id INT PRIMARY KEY,
    customer_id INT NULL,
    CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE cards (
    id INT PRIMARY KEY,
    customer_id INT NULL,
    CONSTRAINT fk_cards_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`;

describe('explainTransformation', () => {
  it('warns on DDL-only stats and explains subset vs collection count for read-heavy profile', () => {
    const model = parseDdlToModel(BANKING_DDL, 'ddl:mysql');
    const plan = buildMigrationPlan(model, getProfile('catalog'));
    const summary = explainTransformation(model, model, plan, getProfile('catalog'));

    expect(summary.hasRowStats).toBe(false);
    expect(summary.readHeavyEligible).toBe(true);
    expect(summary.subsetCollectionCount).toBeGreaterThan(0);
    expect(summary.insights.some((insight) => insight.title.includes('DDL-only'))).toBe(true);
    expect(summary.insights.some((insight) => insight.title.includes('Subset pattern'))).toBe(true);
    expect(summary.markdown).toContain('# Transformation Summary');
  });

  it('warns when profile is not read-heavy enough for embed/subset', () => {
    const model = parseDdlToModel(BANKING_DDL, 'ddl:mysql');
    const plan = buildMigrationPlan(model, getProfile('ledger'));
    const summary = explainTransformation(model, model, plan, getProfile('ledger'));

    expect(summary.readHeavyEligible).toBe(false);
    expect(summary.subsetCollectionCount).toBe(0);
    expect(summary.insights.some((insight) => insight.title.includes('gated off'))).toBe(true);
  });
});
