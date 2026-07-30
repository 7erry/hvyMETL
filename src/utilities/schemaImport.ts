import { normalizeDialectId } from '../dialects.js';
import type { SqlStructuralModel } from '../types.js';
import { parseDdlToModel } from './ddlParser.js';
import { parseDynamoDbCloudFormationToModel } from './dynamodbCloudFormationParser.js';
import { parseJsonSchemaToModel } from './jsonSchemaParser.js';

/**
 * Parse pasted schema import content for the requested dialect.
 * SQL dialects use the shared DDL parser; DynamoDB uses CloudFormation templates.
 */
export function parseSchemaImport(
  content: string,
  dialect: string,
  sourceLabel?: string,
): SqlStructuralModel {
  const normalized = normalizeDialectId(dialect);
  const label = sourceLabel ?? `ddl:${normalized}`;

  if (normalized === 'dynamodb') {
    return parseDynamoDbCloudFormationToModel(content, label);
  }

  if (normalized === 'json-schema') {
    return parseJsonSchemaToModel(content, label);
  }

  return parseDdlToModel(content, label);
}
