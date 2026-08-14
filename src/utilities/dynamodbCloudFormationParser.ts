/**
 * Parse AWS CloudFormation templates (YAML or JSON) containing
 * AWS::DynamoDB::Table resources into SqlStructuralModel for Migration Studio.
 */

import { parse as parseYaml } from 'yaml';
import type {
  ColumnModel,
  DynamoDbGsiModel,
  DynamoDbTableMetadata,
  SqlStructuralModel,
  TableModel,
} from '../types.js';

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

function parseProjection(gsi: Record<string, unknown>): Pick<DynamoDbGsiModel, 'projectionType' | 'nonKeyAttributes'> {
  const projection = asRecord(gsi.Projection);
  const rawType = String(projection.ProjectionType ?? 'ALL').trim().toUpperCase();
  const projectionType =
    rawType === 'KEYS_ONLY' || rawType === 'INCLUDE' ? rawType : ('ALL' as const);
  const nonKeyAttributes = asArray<unknown>(projection.NonKeyAttributes)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return {
    projectionType,
    nonKeyAttributes: projectionType === 'INCLUDE' && nonKeyAttributes.length > 0 ? nonKeyAttributes : undefined,
  };
}

function parseGlobalSecondaryIndexes(properties: Record<string, unknown>): DynamoDbGsiModel[] {
  const indexes: DynamoDbGsiModel[] = [];

  for (const gsi of asArray<Record<string, unknown>>(properties.GlobalSecondaryIndexes)) {
    const indexName = String(gsi.IndexName ?? 'GSI').trim();
    const keySchema = parseKeySchema(gsi.KeySchema);
    if (!keySchema.hash) continue;
    indexes.push({
      indexName,
      hashKey: keySchema.hash,
      rangeKey: keySchema.range,
      ...parseProjection(gsi),
    });
  }

  return indexes;
}

function resolveTableName(logicalId: string, properties: Record<string, unknown>): {
  displayName: string;
  physicalTableName?: string;
} {
  const rawTableName = properties.TableName;
  if (typeof rawTableName === 'string' && rawTableName.trim()) {
    return { displayName: rawTableName.trim(), physicalTableName: rawTableName.trim() };
  }
  return { displayName: logicalId, physicalTableName: undefined };
}

function buildColumn(
  name: string,
  attributeType: string,
  options: {
    isPrimaryKey: boolean;
    dynamoKeyRole?: ColumnModel['dynamoKeyRole'];
    dynamoGsiName?: string;
  },
): ColumnModel {
  const mapped = mapAttributeType(attributeType);
  return {
    name,
    sqlType: mapped.sqlType,
    bsonType: mapped.bsonType,
    nullable: !options.isPrimaryKey && options.dynamoKeyRole !== 'ttl',
    isPrimaryKey: options.isPrimaryKey,
    dynamoKeyRole: options.dynamoKeyRole,
    dynamoGsiName: options.dynamoGsiName,
  };
}

function orderedDynamoColumns(
  attributeDefinitions: Map<string, string>,
  mainKey: ReturnType<typeof parseKeySchema>,
  gsiIndexes: DynamoDbGsiModel[],
  ttlAttribute: string,
): ColumnModel[] {
  const columns: ColumnModel[] = [];
  const seen = new Set<string>();

  const pushColumn = (column: ColumnModel) => {
    if (seen.has(column.name)) return;
    seen.add(column.name);
    columns.push(column);
  };

  if (mainKey.hash) {
    pushColumn(
      buildColumn(mainKey.hash, attributeDefinitions.get(mainKey.hash) ?? 'S', {
        isPrimaryKey: true,
        dynamoKeyRole: 'pk-hash',
      }),
    );
  }
  if (mainKey.range) {
    pushColumn(
      buildColumn(mainKey.range, attributeDefinitions.get(mainKey.range) ?? 'S', {
        isPrimaryKey: true,
        dynamoKeyRole: 'pk-range',
      }),
    );
  }

  for (const gsi of gsiIndexes) {
    pushColumn(
      buildColumn(gsi.hashKey, attributeDefinitions.get(gsi.hashKey) ?? 'S', {
        isPrimaryKey: false,
        dynamoKeyRole: 'gsi-hash',
        dynamoGsiName: gsi.indexName,
      }),
    );
    if (gsi.rangeKey) {
      pushColumn(
        buildColumn(gsi.rangeKey, attributeDefinitions.get(gsi.rangeKey) ?? 'S', {
          isPrimaryKey: false,
          dynamoKeyRole: 'gsi-range',
          dynamoGsiName: gsi.indexName,
        }),
      );
    }
  }

  if (ttlAttribute) {
    pushColumn(
      buildColumn(ttlAttribute, attributeDefinitions.get(ttlAttribute) ?? 'N', {
        isPrimaryKey: false,
        dynamoKeyRole: 'ttl',
      }),
    );
  }

  for (const [name, attributeType] of attributeDefinitions.entries()) {
    if (seen.has(name)) continue;
    pushColumn(buildColumn(name, attributeType, { isPrimaryKey: false }));
  }

  return columns;
}

function buildTableModel(logicalId: string, properties: Record<string, unknown>): TableModel {
  const { displayName, physicalTableName } = resolveTableName(logicalId, properties);
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
  const gsiIndexes = parseGlobalSecondaryIndexes(properties);
  const primaryKey = mainKey.ordered;
  const columns = orderedDynamoColumns(attributeDefinitions, mainKey, gsiIndexes, ttlAttribute);

  if (columns.length === 0) {
    throw new Error(`DynamoDB table "${displayName}" has no AttributeDefinitions.`);
  }

  const pitr = asRecord(properties.PointInTimeRecoverySpecification);
  const sse = asRecord(properties.SSESpecification);
  const stream = asRecord(properties.StreamSpecification);

  const dynamoDb: DynamoDbTableMetadata = {
    logicalId,
    physicalTableName,
    billingMode: typeof properties.BillingMode === 'string' ? properties.BillingMode : undefined,
    streamViewType: typeof stream.StreamViewType === 'string' ? stream.StreamViewType : undefined,
    ttlAttribute: ttlAttribute || undefined,
    pointInTimeRecovery: pitr.PointInTimeRecoveryEnabled === true || pitr.PointInTimeRecoveryEnabled === 'true',
    sseEnabled: sse.SSEEnabled === true || sse.SSEEnabled === 'true',
    globalSecondaryIndexes: gsiIndexes,
  };

  return {
    name: displayName,
    columns,
    primaryKey: primaryKey.length > 0 ? primaryKey : [columns[0]!.name],
    foreignKeys: [],
    rowCount: 0,
    dynamoDb,
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
