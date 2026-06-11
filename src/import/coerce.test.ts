/**
 * Tests for the CSV-to-document modeling rules and the CSV dialect helpers,
 * proving the ETL writer and the import reader agree end to end.
 */

import { describe, expect, it } from 'vitest';
import { formatCsvRow, parseCsv } from '../utilities/csv.js';
import { coerceValue, rowToDocument } from './coerce.js';

describe('coerceValue', () => {
  it('coerces empty cells to null', () => {
    expect(coerceValue('')).toBeNull();
  });

  it('coerces numbers and booleans', () => {
    expect(coerceValue('42')).toBe(42);
    expect(coerceValue('-3.5')).toBe(-3.5);
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('false')).toBe(false);
  });

  it('keeps unsafe-integer digit strings as strings (id precision)', () => {
    expect(coerceValue('92233720368547758070')).toBe('92233720368547758070');
  });

  it('parses JSON objects and arrays', () => {
    expect(coerceValue('{"a":1}')).toEqual({ a: 1 });
    expect(coerceValue('[1,2]')).toEqual([1, 2]);
  });
});

describe('rowToDocument', () => {
  it('builds nested objects from dotted headers', () => {
    const document = rowToDocument(['_id', 'brand.name', 'brand.country'], ['p-1', 'Acme', 'US']);
    expect(document).toEqual({ _id: 'p-1', brand: { name: 'Acme', country: 'US' } });
  });

  it('builds indexed arrays from numeric path segments', () => {
    const document = rowToDocument(['items.0.sku', 'items.1.sku'], ['A', 'B']);
    expect(document).toEqual({ items: [{ sku: 'A' }, { sku: 'B' }] });
  });

  it('parses "[]" headers as one JSON value at the path', () => {
    const document = rowToDocument(['tags[]'], ['["a","b"]']);
    expect(document).toEqual({ tags: ['a', 'b'] });
  });

  it('keeps _id exactly as written, even when it looks numeric', () => {
    const document = rowToDocument(['_id', 'count'], ['42', '42']);
    expect(document._id).toBe('42');
    expect(document.count).toBe(42);
  });
});

describe('CSV round trip', () => {
  it('survives quotes, commas, and newlines', () => {
    const original = ['a,b', 'say "hi"', 'line1\nline2', '', 'plain'];
    const text = `${formatCsvRow(original)}\n`;
    const [parsed] = parseCsv(text);
    expect(parsed).toEqual(original);
  });

  it('round-trips a JSON array cell (the embedded-array shape)', () => {
    const payload = JSON.stringify([{ k: 'color', v: 'red' }]);
    const text = `${formatCsvRow(['1', payload])}\n`;
    const [parsed] = parseCsv(text);
    const document = rowToDocument(['_id', 'attributes[]'], parsed);
    expect(document.attributes).toEqual([{ k: 'color', v: 'red' }]);
  });
});
