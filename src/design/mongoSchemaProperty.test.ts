import { describe, expect, it } from 'vitest';
import { subsetLimitForChildTable } from './embedThresholds.js';
import { isAddressLikeTable, mongoJsonSchemaForColumn } from './mongoSchemaProperty.js';

describe('subsetLimitForChildTable', () => {
  it('uses tighter caps for addresses and loyalty', () => {
    expect(subsetLimitForChildTable('customer_addresses')).toBe(5);
    expect(subsetLimitForChildTable('loyalty_programs')).toBe(3);
    expect(subsetLimitForChildTable('reviews')).toBe(10);
  });
});

describe('mongoJsonSchemaForColumn', () => {
  it('maps money columns to decimal BSON', () => {
    const spec = mongoJsonSchemaForColumn(
      {
        name: 'credit_limit',
        sqlType: 'NUMBER(12,2)',
        bsonType: 'long',
        nullable: true,
        isPrimaryKey: false,
      },
      'customers',
    );
    expect(spec.bsonType).toEqual(['decimal', 'null']);
  });

  it('documents ISO country codes for countryId', () => {
    const spec = mongoJsonSchemaForColumn(
      {
        name: 'country_id',
        sqlType: 'VARCHAR(2)',
        bsonType: 'string',
        nullable: true,
        isPrimaryKey: false,
      },
      'customer_addresses',
    );
    expect(spec.description).toContain('ISO 3166-1');
  });
});

describe('isAddressLikeTable', () => {
  it('detects address child tables', () => {
    expect(isAddressLikeTable('customer_addresses')).toBe(true);
    expect(isAddressLikeTable('orders')).toBe(false);
  });
});
