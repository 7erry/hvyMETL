import { dialectFromModelSource, isSupportedDialect, normalizeDialectId } from '../dialects.js';
import type { SqlStructuralModel } from '../types.js';
import { parseDdlToModel } from './ddlParser.js';
import {
  looksLikeCloudFormationImport,
  parseDynamoDbCloudFormationToModel,
} from './dynamodbCloudFormationParser.js';
import { looksLikeJsonSchemaImport, parseJsonSchemaToModel } from './jsonSchemaParser.js';
import { structuralModelToMockDdl } from './mockCsvDdlAdapter.js';
import {
  looksLikeSqlStructuralModelJson,
  parseStructuralModelJsonImport,
} from './structuralModelJsonParser.js';

export type SchemaImportWithMeta = {
  model: SqlStructuralModel;
  /** Text to show in the DDL editor after import (SQL or original JSON). */
  displayText: string;
  resolvedDialect: string;
};

/** Coerce API `ddl` field from string or parsed JSON object into import text. */
export function normalizeSchemaImportContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') {
    return JSON.stringify(raw, null, 2);
  }
  return String(raw);
}

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
  if (looksLikeSqlStructuralModelJson(trimmed)) {
    const structural = parseStructuralModelJsonImport(trimmed);
    if (structural?.dialect && isSupportedDialect(structural.dialect)) {
      return structural.dialect;
    }
    const fromSource = dialectFromModelSource(structural?.model.source ?? '');
    if (fromSource) return fromSource;
  }
  if (looksLikeJsonSchemaImport(trimmed)) {
    return 'json-schema';
  }
  if (looksLikeCloudFormationImport(trimmed)) {
    return 'dynamodb';
  }

  return normalized;
}

/**
 * Parse pasted schema import content with dialect and editor text metadata.
 * SQL dialects use the shared DDL parser; DynamoDB uses CloudFormation templates;
 * JSON Schema and SqlStructuralModel JSON are auto-detected.
 */
export function parseSchemaImportWithMeta(
  content: string,
  dialect: string,
  sourceLabel?: string,
): SchemaImportWithMeta {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Schema import content is empty.');
  }

  const structural = parseStructuralModelJsonImport(trimmed, sourceLabel ?? 'json:import');
  if (structural) {
    const fromSource = dialectFromModelSource(structural.model.source);
    const resolvedDialect =
      (structural.dialect && isSupportedDialect(structural.dialect) ? structural.dialect : undefined) ??
      fromSource ??
      normalizeDialectId(dialect) ??
      'postgresql';
    const ddlText = structural.ddlText?.trim() || structuralModelToMockDdl(structural.model);
    return {
      model: structural.model,
      displayText: ddlText,
      resolvedDialect,
    };
  }

  const normalized = resolveSchemaImportDialect(content, dialect);
  const label = sourceLabel ?? `ddl:${normalized}`;

  if (normalized === 'dynamodb') {
    return {
      model: parseDynamoDbCloudFormationToModel(content, label),
      displayText: trimmed,
      resolvedDialect: normalized,
    };
  }

  if (normalized === 'json-schema') {
    return {
      model: parseJsonSchemaToModel(content, label),
      displayText: trimmed,
      resolvedDialect: normalized,
    };
  }

  const model = parseDdlToModel(content, label);
  if (model.tables.length === 0 && looksLikeJsonSchemaImport(content)) {
    throw new Error(
      'Content looks like JSON Schema. Choose the JSON Schema dialect or paste valid CREATE TABLE DDL.',
    );
  }
  if (model.tables.length === 0 && looksLikeSqlStructuralModelJson(content)) {
    throw new Error(
      'Content looks like a SqlStructuralModel JSON export but could not be parsed. Check table and column shapes.',
    );
  }
  return { model, displayText: trimmed, resolvedDialect: normalized };
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
  return parseSchemaImportWithMeta(content, dialect, sourceLabel).model;
}
