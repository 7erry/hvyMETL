import { normalizeDialectId } from '../dialects.js';
import type { SqlStructuralModel } from '../types.js';
import { parseDdlToModel } from './ddlParser.js';
import {
  looksLikeCloudFormationImport,
  parseDynamoDbCloudFormationToModel,
} from './dynamodbCloudFormationParser.js';
import { looksLikeJsonSchemaImport, parseJsonSchemaToModel } from './jsonSchemaParser.js';

/**
 * Pick json-schema or dynamodb when pasted content is clearly not SQL DDL,
 * even if the UI dialect is still a SQL engine (avoids silent 0-table imports).
 */
export function resolveSchemaImportDialect(content: string, dialect: string): string {
  const normalized = normalizeDialectId(dialect);
  if (normalized === 'json-schema' || normalized === 'dynamodb') {
    return normalized;
  }

  const trimmed = content.trim();
  if (looksLikeJsonSchemaImport(trimmed)) {
    return 'json-schema';
  }
  if (looksLikeCloudFormationImport(trimmed)) {
    return 'dynamodb';
  }

  return normalized;
}

/**
 * Parse pasted schema import content for the requested dialect.
 * SQL dialects use the shared DDL parser; DynamoDB uses CloudFormation templates.
 */
export function parseSchemaImport(
  content: string,
  dialect: string,
  sourceLabel?: string,
): SqlStructuralModel {
  const normalized = resolveSchemaImportDialect(content, dialect);
  const label = sourceLabel ?? `ddl:${normalized}`;

  if (normalized === 'dynamodb') {
    return parseDynamoDbCloudFormationToModel(content, label);
  }

  if (normalized === 'json-schema') {
    return parseJsonSchemaToModel(content, label);
  }

  const model = parseDdlToModel(content, label);
  if (model.tables.length === 0 && looksLikeJsonSchemaImport(content)) {
    throw new Error(
      'Content looks like JSON Schema. Choose the JSON Schema dialect or paste valid CREATE TABLE DDL.',
    );
  }
  return model;
}
