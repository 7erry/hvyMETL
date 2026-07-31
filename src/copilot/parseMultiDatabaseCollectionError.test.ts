import { describe, expect, it } from 'vitest';
import { parseMultiDatabaseCollectionError } from './parseMultiDatabaseCollectionError.js';

describe('parseMultiDatabaseCollectionError', () => {
  it('extracts database names from inspect errors', () => {
    expect(
      parseMultiDatabaseCollectionError(
        'Collection "products" exists in multiple databases (fancy, myvectorizedcatalog). Specify the database argument.',
      ),
    ).toEqual(['fancy', 'myvectorizedcatalog']);
  });

  it('returns null for unrelated errors', () => {
    expect(parseMultiDatabaseCollectionError('Access denied')).toBeNull();
  });
});
