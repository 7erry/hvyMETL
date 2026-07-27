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
    expect(orders.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['CustomerId', 'OrderId', 'OrderDate', 'ExpirationTime']),
    );

    const customerId = orders.columns.find((column) => column.name === 'CustomerId');
    const orderDate = orders.columns.find((column) => column.name === 'OrderDate');
    const expirationTime = orders.columns.find((column) => column.name === 'ExpirationTime');

    expect(customerId?.sqlType).toBe('STRING (PK HASH)');
    expect(customerId?.isPrimaryKey).toBe(true);
    expect(orderDate?.sqlType).toBe('STRING (GSI DateIndex HASH)');
    expect(expirationTime?.sqlType).toBe('NUMBER (TTL)');
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
