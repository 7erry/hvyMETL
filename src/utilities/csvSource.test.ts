import { describe, expect, it } from 'vitest';
import {
  csvBaseName,
  csvMatchKeysForTableIdentifier,
  csvTableMatchWarnings,
  matchCsvFilesForCollection,
} from './csvSource.js';
import type { CollectionPlan } from '../types.js';

const sampleCollection = (name: string, sourceTable: string): CollectionPlan => ({
  name,
  sourceTable,
  mergedTables: [sourceTable],
  idDerivation: { strategy: 'direct', sourceColumns: ['id'] },
  patterns: [],
  jsonSchema: {},
  indexes: [],
  embeddedArrays: [],
  extendedReferences: [],
  computedFields: [],
});

describe('csvSource', () => {
  it('strips chunk suffix from csv basenames', () => {
    expect(csvBaseName('/data/products.chunk1.csv')).toBe('products');
    expect(csvBaseName('/data/orders.csv')).toBe('orders');
  });

  it('includes schema-qualified and short table keys', () => {
    expect(csvMatchKeysForTableIdentifier('ion_user.users')).toEqual(
      expect.arrayContaining(['ion_user.users', 'users', 'ion_user_users']),
    );
  });

  it('matches PostgreSQL mock CSV short names to qualified source tables', () => {
    const files = ['/mock/users.csv', '/mock/fact_context.csv'];
    const users = sampleCollection('ionUser.users', 'ion_user.users');
    const factContext = sampleCollection('ionFacts.factContext', 'ion_facts.fact_context');

    expect(matchCsvFilesForCollection(files, users)).toEqual(['/mock/users.csv']);
    expect(matchCsvFilesForCollection(files, factContext)).toEqual(['/mock/fact_context.csv']);
  });

  it('matches files by collection name or source table', () => {
    const files = [
      '/exports/products.csv',
      '/exports/products.chunk2.csv',
      '/exports/customers.csv',
      '/exports/unrelated.csv',
    ];
    const products = sampleCollection('products', 'product');
    const customers = sampleCollection('customers', 'customers');

    expect(matchCsvFilesForCollection(files, products)).toEqual([
      '/exports/products.csv',
      '/exports/products.chunk2.csv',
    ]);
    expect(matchCsvFilesForCollection(files, customers)).toEqual(['/exports/customers.csv']);
  });

  it('warns when CSV names do not match SQL tables', () => {
    const warnings = csvTableMatchWarnings(['clusters.csv'], ['orders', 'customers']);
    expect(warnings[0]).toMatch(/No CSV files match/);
    expect(warnings[0]).toMatch(/clusters\.csv/);
  });
});
