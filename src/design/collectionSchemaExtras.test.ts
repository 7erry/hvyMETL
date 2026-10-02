import { describe, expect, it } from 'vitest';
import type { TableModel } from '../types.js';
import { pickDenormReferenceColumns, rootRequiredFields } from './collectionSchemaExtras.js';

const customersTable: TableModel = {
  name: 'customers',
  rowCount: 1000,
  primaryKey: ['customer_id'],
  columns: [
    { name: 'customer_id', sqlType: 'NUMBER', bsonType: 'long', nullable: false, isPrimaryKey: true },
    { name: 'email', sqlType: 'VARCHAR(120)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    { name: 'first_name', sqlType: 'VARCHAR(60)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    { name: 'last_name', sqlType: 'VARCHAR(60)', bsonType: 'string', nullable: true, isPrimaryKey: false },
  ],
  foreignKeys: [],
};

describe('collectionSchemaExtras', () => {
  it('includes non-null columns in root required', () => {
    expect(rootRequiredFields(customersTable)).toEqual(
      expect.arrayContaining(['_id', 'schemaVersion', 'email', 'firstName']),
    );
  });

  it('picks customer denorm columns for extended reference', () => {
    expect(pickDenormReferenceColumns(customersTable)).toEqual(
      expect.arrayContaining(['customer_id', 'email', 'first_name']),
    );
  });
});
