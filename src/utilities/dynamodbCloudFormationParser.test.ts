import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDynamoDbCloudFormationToModel } from './dynamodbCloudFormationParser.js';
import { parseSchemaImport } from './schemaImport.js';

const EXAMPLE_TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../examples/dynamodb/orders-table.yaml'),
  'utf8',
);

const ECOMMERCE_CATALOG_TEMPLATE = `AWSTemplateFormatVersion: '2010-09-09'
Resources:
  EcommerceCatalogTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub 'ecommerce-catalog-\${Environment}'
      BillingMode: PAY_PER_REQUEST
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      SSESpecification:
        SSEEnabled: true
      StreamSpecification:
        StreamViewType: NEW_AND_OLD_IMAGES
      TimeToLiveSpecification:
        AttributeName: ExpireAt
        Enabled: true
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: GSI2PK
          AttributeType: S
        - AttributeName: GSI2SK
          AttributeType: S
        - AttributeName: GSI3PK
          AttributeType: S
        - AttributeName: GSI3SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GSI1-Category-Price-Index
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: GSI2-SKU-Brand-Index
          KeySchema:
            - AttributeName: GSI2PK
              KeyType: HASH
            - AttributeName: GSI2SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: GSI3-Seller-Status-Index
          KeySchema:
            - AttributeName: GSI3PK
              KeyType: HASH
            - AttributeName: GSI3SK
              KeyType: RANGE
          Projection:
            ProjectionType: INCLUDE
            NonKeyAttributes:
              - ItemName
              - PrimaryImageUrl
              - Price
              - InventoryCount
              - ProductStatus
              - UpdatedAt
`;

const CMS_PLATFORM_TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../examples/dynamodb/cms-platform-table.yaml'),
  'utf8',
);

const JSON_TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: '2010-09-09',
  Resources: {
    OrdersTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'Production-Orders',
        AttributeDefinitions: [
          { AttributeName: 'CustomerId', AttributeType: 'S' },
          { AttributeName: 'OrderId', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'CustomerId', KeyType: 'HASH' },
          { AttributeName: 'OrderId', KeyType: 'RANGE' },
        ],
      },
    },
  },
});

describe('parseDynamoDbCloudFormationToModel', () => {
  it('parses the bundled orders-table CloudFormation YAML example', () => {
    const model = parseDynamoDbCloudFormationToModel(EXAMPLE_TEMPLATE, 'ddl:dynamodb');
    expect(model.tables).toHaveLength(1);

    const orders = model.tables[0]!;
    expect(orders.name).toBe('Production-Orders');
    expect(orders.primaryKey).toEqual(['CustomerId', 'OrderId']);
    expect(orders.columns.map((column) => column.name)).toEqual([
      'CustomerId',
      'OrderId',
      'OrderDate',
      'ExpirationTime',
    ]);

    const customerId = orders.columns.find((column) => column.name === 'CustomerId');
    const orderDate = orders.columns.find((column) => column.name === 'OrderDate');
    const expirationTime = orders.columns.find((column) => column.name === 'ExpirationTime');

    expect(customerId?.sqlType).toBe('STRING');
    expect(customerId?.dynamoKeyRole).toBe('pk-hash');
    expect(customerId?.isPrimaryKey).toBe(true);
    expect(orderDate?.sqlType).toBe('STRING');
    expect(orderDate?.dynamoKeyRole).toBe('gsi-hash');
    expect(orderDate?.dynamoGsiName).toBe('DateIndex');
    expect(expirationTime?.sqlType).toBe('NUMBER');
    expect(expirationTime?.dynamoKeyRole).toBe('ttl');
    expect(orders.dynamoDb?.globalSecondaryIndexes).toEqual([
      {
        indexName: 'DateIndex',
        hashKey: 'OrderDate',
        rangeKey: 'OrderId',
        projectionType: 'ALL',
      },
    ]);
    expect(orders.dynamoDb?.billingMode).toBe('PAY_PER_REQUEST');
    expect(orders.dynamoDb?.ttlAttribute).toBe('ExpirationTime');
    expect(orders.dynamoDb?.sseEnabled).toBe(true);
  });

  it('parses a single-table ecommerce catalog template with three GSIs and TTL', () => {
    const model = parseDynamoDbCloudFormationToModel(ECOMMERCE_CATALOG_TEMPLATE);
    const table = model.tables[0]!;

    expect(table.name).toBe('EcommerceCatalogTable');
    expect(table.dynamoDb?.logicalId).toBe('EcommerceCatalogTable');
    expect(table.dynamoDb?.billingMode).toBe('PAY_PER_REQUEST');
    expect(table.dynamoDb?.streamViewType).toBe('NEW_AND_OLD_IMAGES');
    expect(table.dynamoDb?.pointInTimeRecovery).toBe(true);
    expect(table.dynamoDb?.ttlAttribute).toBe('ExpireAt');
    expect(table.columns.map((column) => column.name)).toEqual([
      'PK',
      'SK',
      'GSI1PK',
      'GSI1SK',
      'GSI2PK',
      'GSI2SK',
      'GSI3PK',
      'GSI3SK',
      'ExpireAt',
    ]);
    expect(table.dynamoDb?.globalSecondaryIndexes).toHaveLength(3);
    expect(table.dynamoDb?.globalSecondaryIndexes[2]).toMatchObject({
      indexName: 'GSI3-Seller-Status-Index',
      hashKey: 'GSI3PK',
      rangeKey: 'GSI3SK',
      projectionType: 'INCLUDE',
      nonKeyAttributes: ['ItemName', 'PrimaryImageUrl', 'Price', 'InventoryCount', 'ProductStatus', 'UpdatedAt'],
    });
  });

  it('parses the bundled cms-platform-table CloudFormation YAML example', () => {
    const model = parseDynamoDbCloudFormationToModel(CMS_PLATFORM_TEMPLATE, 'ddl:dynamodb');
    const table = model.tables[0]!;

    expect(table.name).toBe('CmsPlatformTable');
    expect(table.dynamoDb?.logicalId).toBe('CmsPlatformTable');
    expect(table.dynamoDb?.billingMode).toBe('PAY_PER_REQUEST');
    expect(table.dynamoDb?.streamViewType).toBe('NEW_AND_OLD_IMAGES');
    expect(table.dynamoDb?.pointInTimeRecovery).toBe(true);
    expect(table.dynamoDb?.ttlAttribute).toBe('ExpireAt');
    expect(table.dynamoDb?.globalSecondaryIndexes).toHaveLength(3);
    expect(table.dynamoDb?.globalSecondaryIndexes[0]?.indexName).toBe('GSI1-PublishFeed-Taxonomy-Index');
    expect(table.dynamoDb?.globalSecondaryIndexes[1]).toMatchObject({
      indexName: 'GSI2-Author-Moderation-Index',
      projectionType: 'INCLUDE',
      nonKeyAttributes: ['ContentId', 'Title', 'AuthorId', 'Status', 'CommentText', 'UserHandle', 'UpdatedAt'],
    });
    expect(table.dynamoDb?.globalSecondaryIndexes[2]?.projectionType).toBe('KEYS_ONLY');
  });

  it('parses JSON CloudFormation templates', () => {
    const model = parseDynamoDbCloudFormationToModel(JSON_TEMPLATE);
    expect(model.tables[0]?.name).toBe('Production-Orders');
    expect(model.tables[0]?.primaryKey).toEqual(['CustomerId', 'OrderId']);
  });

  it('throws when no DynamoDB table resources are present', () => {
    expect(() =>
      parseDynamoDbCloudFormationToModel('Resources:\n  Bucket:\n    Type: AWS::S3::Bucket'),
    ).toThrow(/No AWS::DynamoDB::Table resources found/);
  });
});

describe('parseSchemaImport', () => {
  it('routes dynamodb dialect imports to the CloudFormation parser', () => {
    const model = parseSchemaImport(EXAMPLE_TEMPLATE, 'dynamodb', 'ddl:dynamodb');
    expect(model.source).toBe('ddl:dynamodb');
    expect(model.tables[0]?.name).toBe('Production-Orders');
  });
});
