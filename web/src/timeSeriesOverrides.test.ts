import { describe, expect, it } from 'vitest';
import {
  metaFieldOptionsForTable,
  metaFieldSelectOptions,
  timeFieldOptionsForTable,
  timeFieldSelectOptions,
} from './timeSeriesOverrides';
import type { TableModel } from './types';

const stocksTable: TableModel = {
  name: 'stocks',
  columns: [
    { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
    { name: 'ticker', sqlType: 'TEXT', bsonType: 'string', nullable: false, isPrimaryKey: false },
    { name: 'date', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
    { name: 'price', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
  ],
  primaryKey: ['id'],
  foreignKeys: [],
  rowCount: 100,
};

describe('timeSeriesOverrides field picklists', () => {
  it('lists date-like columns for timeField', () => {
    expect(timeFieldOptionsForTable(stocksTable).map((option) => option.bsonField)).toEqual(['date']);
  });

  it('excludes the time field from metaField options', () => {
    expect(metaFieldOptionsForTable(stocksTable, 'date').map((option) => option.bsonField)).toEqual([
      'id',
      'ticker',
      'price',
    ]);
  });

  it('retains a persisted selection when the column no longer matches heuristics', () => {
    const options = timeFieldSelectOptions(stocksTable, 'legacyAt');
    expect(options.some((option) => option.bsonField === 'legacyAt')).toBe(true);
  });
});
