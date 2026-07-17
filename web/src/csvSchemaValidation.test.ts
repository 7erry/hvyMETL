import { describe, expect, it } from 'vitest';
import { csvTableMatchWarnings, fatalCsvSchemaMismatch } from './csvSchemaValidation';

describe('csvSchemaValidation', () => {
  it('flags Atlas cluster exports that do not match SQL tables', () => {
    const warnings = csvTableMatchWarnings(['clusters.csv'], ['orders', 'customers', 'products']);
    expect(warnings[0]).toMatch(/No CSV files match/);
    expect(warnings[0]).toMatch(/clusters\.csv/);
  });

  it('accepts table-named CSV files', () => {
    expect(csvTableMatchWarnings(['orders.csv', 'customers.csv'], ['orders', 'customers'])).toEqual([]);
  });

  it('returns fatal mismatch for unrelated CSV picks', () => {
    expect(fatalCsvSchemaMismatch(['clusters.csv'], ['orders'])).toMatch(/No CSV files match/);
    expect(fatalCsvSchemaMismatch(['orders.csv'], ['orders'])).toBeNull();
  });
});
