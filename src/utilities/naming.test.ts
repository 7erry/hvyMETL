import { describe, expect, it } from 'vitest';
import { mongoCollectionNameFromTable, normalizeMongoCollectionName, toCamelCase, toPascalCase } from './naming.js';

describe('toCamelCase', () => {
  it('converts snake_case to camelCase', () => {
    expect(toCamelCase('order_items')).toBe('orderItems');
    expect(toCamelCase('department_id')).toBe('departmentId');
  });

  it('lowercases ALL_CAPS table names instead of rEGIONS', () => {
    expect(toCamelCase('REGIONS')).toBe('regions');
    expect(toCamelCase('EMPLOYEES')).toBe('employees');
    expect(toCamelCase('DEPARTMENTS')).toBe('departments');
  });

  it('converts ALL_CAPS snake identifiers to camelCase', () => {
    expect(toCamelCase('ORDER_ITEMS')).toBe('orderItems');
    expect(toCamelCase('FX_RATE_ID')).toBe('fxRateId');
  });

  it('preserves mixed-case and camelCase identifiers', () => {
    expect(toCamelCase('orderItems')).toBe('orderItems');
    expect(toCamelCase('MyTable')).toBe('myTable');
    expect(toCamelCase('department_name')).toBe('departmentName');
  });
});

describe('mongoCollectionNameFromTable', () => {
  it('joins schema-qualified tables with underscores', () => {
    expect(mongoCollectionNameFromTable('ion_user.users')).toBe('ionUser_users');
    expect(mongoCollectionNameFromTable('ion_facts.fact_context')).toBe('ionFacts_factContext');
  });

  it('leaves unqualified tables as camelCase', () => {
    expect(mongoCollectionNameFromTable('order_items')).toBe('orderItems');
    expect(mongoCollectionNameFromTable('users')).toBe('users');
  });
});

describe('normalizeMongoCollectionName', () => {
  it('maps legacy dotted collection names using sourceTable', () => {
    expect(normalizeMongoCollectionName('ionUser.users', 'ion_user.users')).toBe('ionUser_users');
  });
});

describe('toPascalCase', () => {
  it('uppercases the first letter after camelCase normalization', () => {
    expect(toPascalCase('REGIONS')).toBe('Regions');
    expect(toPascalCase('order_items')).toBe('OrderItems');
  });
});
