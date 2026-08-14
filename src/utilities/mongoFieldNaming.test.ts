import { describe, expect, it } from 'vitest';
import type { ColumnModel } from '../types.js';
import { mongoFieldNameForColumn, toCamelCaseFromDelimited } from './mongoFieldNaming.js';

function column(partial: Partial<ColumnModel> & Pick<ColumnModel, 'name'>): ColumnModel {
  return {
    sqlType: 'STRING',
    bsonType: 'string',
    nullable: true,
    isPrimaryKey: false,
    ...partial,
  };
}

describe('toCamelCaseFromDelimited', () => {
  it('converts DynamoDB GSI index names to camelCase MongoDB fields', () => {
    expect(toCamelCaseFromDelimited('GSI1-Category-Price-Index')).toBe('gSI1CategoryPriceIndex');
    expect(toCamelCaseFromDelimited('GSI2-SKU-Brand-Index')).toBe('gSI2SKUBrandIndex');
  });
});

describe('mongoFieldNameForColumn', () => {
  it('maps DynamoDB GSI hash keys to their index names', () => {
    expect(
      mongoFieldNameForColumn(
        column({
          name: 'GSI1PK',
          dynamoKeyRole: 'gsi-hash',
          dynamoGsiName: 'GSI1-Category-Price-Index',
        }),
      ),
    ).toBe('gSI1CategoryPriceIndex');
  });

  it('maps DynamoDB GSI range keys to index name plus SortKey suffix', () => {
    expect(
      mongoFieldNameForColumn(
        column({
          name: 'GSI1SK',
          dynamoKeyRole: 'gsi-range',
          dynamoGsiName: 'GSI1-Category-Price-Index',
        }),
      ),
    ).toBe('gSI1CategoryPriceIndexSortKey');
  });

  it('maps table primary keys to partitionKey and sortKey', () => {
    expect(mongoFieldNameForColumn(column({ name: 'PK', dynamoKeyRole: 'pk-hash', isPrimaryKey: true }))).toBe(
      'partitionKey',
    );
    expect(mongoFieldNameForColumn(column({ name: 'SK', dynamoKeyRole: 'pk-range', isPrimaryKey: true }))).toBe(
      'sortKey',
    );
  });

  it('falls back to camelCase for non-Dynamo columns', () => {
    expect(mongoFieldNameForColumn(column({ name: 'customer_id' }))).toBe('customerId');
  });
});
