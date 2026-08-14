import { describe, expect, it } from 'vitest';
import { dynamoTableSections, formatDynamoKeyRole } from './dynamoTableDisplay';
import type { TableModel } from './types';

const ecommerceTable: TableModel = {
  name: 'EcommerceCatalogTable',
  primaryKey: ['PK', 'SK'],
  foreignKeys: [],
  rowCount: 0,
  dynamoDb: {
    logicalId: 'EcommerceCatalogTable',
    billingMode: 'PAY_PER_REQUEST',
    streamViewType: 'NEW_AND_OLD_IMAGES',
    ttlAttribute: 'ExpireAt',
    globalSecondaryIndexes: [
      {
        indexName: 'GSI1-Category-Price-Index',
        hashKey: 'GSI1PK',
        rangeKey: 'GSI1SK',
        projectionType: 'ALL',
      },
      {
        indexName: 'GSI3-Seller-Status-Index',
        hashKey: 'GSI3PK',
        rangeKey: 'GSI3SK',
        projectionType: 'INCLUDE',
        nonKeyAttributes: ['ItemName', 'Price'],
      },
    ],
  },
  columns: [
    { name: 'PK', sqlType: 'STRING', bsonType: 'string', nullable: false, isPrimaryKey: true, dynamoKeyRole: 'pk-hash' },
    { name: 'SK', sqlType: 'STRING', bsonType: 'string', nullable: false, isPrimaryKey: true, dynamoKeyRole: 'pk-range' },
    {
      name: 'GSI1PK',
      sqlType: 'STRING',
      bsonType: 'string',
      nullable: true,
      isPrimaryKey: false,
      dynamoKeyRole: 'gsi-hash',
      dynamoGsiName: 'GSI1-Category-Price-Index',
    },
    {
      name: 'ExpireAt',
      sqlType: 'NUMBER',
      bsonType: 'double',
      nullable: true,
      isPrimaryKey: false,
      dynamoKeyRole: 'ttl',
    },
  ],
};

describe('dynamoTableDisplay', () => {
  it('groups key attributes into primary key, GSI, and TTL sections', () => {
    const sections = dynamoTableSections(ecommerceTable);
    expect(sections.map((section) => section.title)).toEqual([
      'Primary key',
      'GSI1-Category-Price-Index',
      'GSI3-Seller-Status-Index',
      'Time to live',
    ]);
    expect(sections[1]?.columns.map((column) => column.name)).toEqual(['GSI1PK']);
    expect(sections[2]?.subtitle).toContain('Projection: INCLUDE');
  });

  it('formats DynamoDB key roles for diagram rows', () => {
    expect(formatDynamoKeyRole(ecommerceTable.columns[0]!)).toBe('HASH');
    expect(formatDynamoKeyRole(ecommerceTable.columns[3]!)).toBe('TTL');
  });
});
