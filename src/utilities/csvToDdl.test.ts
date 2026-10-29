import { describe, expect, it } from 'vitest';
import { csvFilesToCreateTableDdl, tableNameFromCsvFileName } from './csvToDdl.js';

describe('csvToDdl', () => {
  it('names tables from file names', () => {
    expect(tableNameFromCsvFileName('customers.csv')).toBe('customers');
    expect(tableNameFromCsvFileName('/tmp/order-items.csv')).toBe('order_items');
  });

  it('infers CREATE TABLE DDL from CSV headers and sample values', () => {
    const ddl = csvFilesToCreateTableDdl([
      {
        name: 'customers.csv',
        text: 'id,name,active\n1,Ada,true\n2,Bob,false\n',
      },
    ]);
    expect(ddl).toContain('CREATE TABLE customers');
    expect(ddl).toContain('id INTEGER');
    expect(ddl).toContain('name TEXT');
    expect(ddl).toContain('active BOOLEAN');
  });

  it('emits one table per CSV file', () => {
    const ddl = csvFilesToCreateTableDdl([
      { name: 'a.csv', text: 'id\n1\n' },
      { name: 'b.csv', text: 'code\nx\n' },
    ]);
    expect(ddl).toContain('CREATE TABLE a');
    expect(ddl).toContain('CREATE TABLE b');
  });
});
