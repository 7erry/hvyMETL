/**
 * Parse AWS CloudFormation templates (YAML or JSON) containing
 * AWS::DynamoDB::Table resources into SqlStructuralModel for Migration Studio.
 */

import { parse as parseYaml } from 'yaml';
import type { ColumnModel, SqlStructuralModel, TableModel } from '../types.js';

const DYNAMO_ATTRIBUTE_TYPES: Record<string, { sqlType: string; bsonType: string }> = {
  S: { sqlType: 'STRING', bsonType: 'string' },
  N: { sqlType: 'NUMBER', bsonType: 'double' },
  B: { sqlType: 'BINARY', bsonType: 'binData' },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** True when pasted content is a CloudFormation template rather than SQL DDL. */
export function looksLikeCloudFormationImport(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return (
    /AWSTemplateFormatVersion/i.test(trimmed) ||
    /AWS::DynamoDB::Table/.test(trimmed) ||
    (trimmed.startsWith('{') && trimmed.includes('AWS::DynamoDB::Table'))
  );
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const CLOUDFORMATION_CUSTOM_TAGS = ['!Ref', '!GetAtt', '!Sub', '!Join', '!ImportValue', '!Select', '!Split', '!FindInMap'].map(
  (tag) => ({
    tag,
    resolve: () => null,
  }),
);

/** Parse CloudFormation YAML or JSON into a plain object. */
function parseCloudFormationTemplate(templateText: string): Record<string, unknown> {
  const trimmed = templateText.trim();
  if (!trimmed) {
    throw new Error('CloudFormation template is empty.');
  }

  let document: unknown;
  if (trimmed.startsWith('{')) {
    document = JSON.parse(trimmed) as unknown;
  } else {
    document = parseYaml(templateText, { customTags: CLOUDFORMATION_CUSTOM_TAGS });
  }

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('CloudFormation template must be a YAML or JSON object.');
  }

  return document as Record<string, unknown>;
}

function mapAttributeType(attributeType: string): { sqlType: string; bsonType: string } {
  return DYNAMO_ATTRIBUTE_TYPES[attributeType.trim().toUpperCase()] ?? {
    sqlType: attributeType,
    bsonType: 'string',
  };
}

function parseKeySchema(keySchema: unknown): { ordered: string[]; hash?: string; range?: string } {
  const ordered: string[] = [];
  let hash: string | undefined;
  let range: string | undefined;

  for (const entry of asArray<Record<string, unknown>>(keySchema)) {
    const attributeName = String(entry.AttributeName ?? '').trim();
    const keyType = String(entry.KeyType ?? '').trim().toUpperCase();
    if (!attributeName) continue;
    ordered.push(attributeName);
    if (keyType === 'HASH') hash = attributeName;
    if (keyType === 'RANGE') range = attributeName;
  }

  return { ordered, hash, range };
}

function collectGsiKeyRoles(properties: Record<string, unknown>): Map<string, { indexName: string; keyType: string }> {
  const roles = new Map<string, { indexName: string; keyType: string }>();

  for (const gsi of asArray<Record<string, unknown>>(properties.GlobalSecondaryIndexes)) {
    const indexName = String(gsi.IndexName ?? 'GSI').trim();
    for (const keyEntry of asArray<Record<string, unknown>>(gsi.KeySchema)) {
      const attributeName = String(keyEntry.AttributeName ?? '').trim();
      const keyType = String(keyEntry.KeyType ?? '').trim().toUpperCase();
      if (!attributeName) continue;
      roles.set(attributeName, { indexName, keyType });
    }
  }

  return roles;
}

function buildTableModel(logicalId: string, properties: Record<string, unknown>): TableModel {
  const tableName = String(properties.TableName ?? logicalId).trim() || logicalId;
  const attributeDefinitions = new Map<string, string>();

  for (const definition of asArray<Record<string, unknown>>(properties.AttributeDefinitions)) {
    const attributeName = String(definition.AttributeName ?? '').trim();
    const attributeType = String(definition.AttributeType ?? 'S').trim();
    if (attributeName) {
      attributeDefinitions.set(attributeName, attributeType);
    }
  }

  const ttlSpec = asRecord(properties.TimeToLiveSpecification);
  const ttlEnabled = ttlSpec.Enabled !== false && ttlSpec.Enabled !== 'false';
  const ttlAttribute = ttlEnabled ? String(ttlSpec.AttributeName ?? '').trim() : '';
  if (ttlAttribute && !attributeDefinitions.has(ttlAttribute)) {
    attributeDefinitions.set(ttlAttribute, 'N');
  }

  const mainKey = parseKeySchema(properties.KeySchema);
  const gsiRoles = collectGsiKeyRoles(properties);
  const primaryKey = mainKey.ordered;

  const columns: ColumnModel[] = [...attributeDefinitions.entries()].map(([name, attributeType]) => {
    const mapped = mapAttributeType(attributeType);
    const isPrimaryKey = primaryKey.includes(name);
    const gsiRole = gsiRoles.get(name);
    let sqlType = mapped.sqlType;

    if (isPrimaryKey) {
      const role = name === mainKey.hash ? 'HASH' : 'RANGE';
      sqlType = `${mapped.sqlType} (PK ${role})`;
    } else if (gsiRole) {
      sqlType = `${mapped.sqlType} (GSI ${gsiRole.indexName} ${gsiRole.keyType})`;
    } else if (ttlAttribute && name === ttlAttribute) {
      sqlType = `${mapped.sqlType} (TTL)`;
    }

    return {
      name,
      sqlType,
      bsonType: mapped.bsonType,
      nullable: !isPrimaryKey,
      isPrimaryKey,
    };
  });

  if (columns.length === 0) {
    throw new Error(`DynamoDB table "${tableName}" has no AttributeDefinitions.`);
  }

  return {
    name: tableName,
    columns,
    primaryKey: primaryKey.length > 0 ? primaryKey : [columns[0]!.name],
    foreignKeys: [],
    rowCount: 0,
  };
}

/**
 * Convert a CloudFormation template with DynamoDB tables into the shared SQL
 * structural model shape used by diagrams and the design engine.
 */
export function parseDynamoDbCloudFormationToModel(
  templateText: string,
  sourceLabel = 'ddl:dynamodb',
): SqlStructuralModel {
  const template = parseCloudFormationTemplate(templateText);
  const resources = asRecord(template.Resources);
  const tables: TableModel[] = [];

  for (const [logicalId, resourceValue] of Object.entries(resources)) {
    const resource = asRecord(resourceValue);
    if (resource.Type !== 'AWS::DynamoDB::Table') continue;
    tables.push(buildTableModel(logicalId, asRecord(resource.Properties)));
  }

  if (tables.length === 0) {
    throw new Error('No AWS::DynamoDB::Table resources found in the CloudFormation template.');
  }

  return {
    source: sourceLabel,
    tables,
    relationships: [],
  };
}
