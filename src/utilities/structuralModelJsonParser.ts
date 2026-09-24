/**
 * Import SqlStructuralModel documents from JSON (native model export or hvymetl diagram bundles).
 */

import { isSupportedDialect, normalizeDialectId } from '../dialects.js';
import type {
  ColumnModel,
  ForeignKeyModel,
  RelationshipModel,
  SqlStructuralModel,
  TableModel,
} from '../types.js';
import { normalizeJsonSchemaPaste, parseJsonSchemaRootDocument } from './jsonSchemaParser.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseColumnModel(raw: unknown): ColumnModel | null {
  const record = asRecord(raw);
  const name = asString(record.name).trim();
  if (!name) return null;
  return {
    name,
    sqlType: asString(record.sqlType).trim() || 'TEXT',
    bsonType: asString(record.bsonType).trim() || 'string',
    nullable: asBool(record.nullable, true),
    isPrimaryKey: asBool(record.isPrimaryKey, false),
    ...(record.dynamoKeyRole ? { dynamoKeyRole: record.dynamoKeyRole as ColumnModel['dynamoKeyRole'] } : {}),
    ...(record.dynamoGsiName ? { dynamoGsiName: asString(record.dynamoGsiName) } : {}),
  };
}

function parseForeignKeyModel(raw: unknown): ForeignKeyModel | null {
  const record = asRecord(raw);
  const column = asString(record.column).trim();
  const referencesTable = asString(record.referencesTable).trim();
  const referencesColumn = asString(record.referencesColumn).trim();
  if (!column || !referencesTable || !referencesColumn) return null;
  return { column, referencesTable, referencesColumn };
}

function parseTableModel(raw: unknown): TableModel | null {
  const record = asRecord(raw);
  const name = asString(record.name).trim();
  if (!name) return null;

  const columnsRaw = record.columns;
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) return null;

  const columns = columnsRaw
    .map((entry) => parseColumnModel(entry))
    .filter((column): column is ColumnModel => column !== null);
  if (columns.length === 0) return null;

  const primaryKeyRaw = record.primaryKey;
  const primaryKey = Array.isArray(primaryKeyRaw)
    ? primaryKeyRaw.map((entry) => asString(entry).trim()).filter(Boolean)
    : [];

  const foreignKeysRaw = record.foreignKeys;
  const foreignKeys = Array.isArray(foreignKeysRaw)
    ? foreignKeysRaw
        .map((entry) => parseForeignKeyModel(entry))
        .filter((fk): fk is ForeignKeyModel => fk !== null)
    : [];

  return {
    name,
    columns,
    primaryKey,
    foreignKeys,
    rowCount: asNumber(record.rowCount, 0),
    ...(record.dynamoDb ? { dynamoDb: record.dynamoDb as TableModel['dynamoDb'] } : {}),
  };
}

function parseRelationshipModel(raw: unknown): RelationshipModel | null {
  const record = asRecord(raw);
  const parentTable = asString(record.parentTable).trim();
  const childTable = asString(record.childTable).trim();
  const fkColumn = asString(record.fkColumn).trim();
  if (!parentTable || !childTable || !fkColumn) return null;

  return {
    parentTable,
    childTable,
    fkColumn,
    minChildrenPerParent: asNumber(record.minChildrenPerParent, 0),
    avgChildrenPerParent: asNumber(record.avgChildrenPerParent, 0),
    p95ChildrenPerParent: asNumber(record.p95ChildrenPerParent, 0),
    p99ChildrenPerParent: asNumber(record.p99ChildrenPerParent, 0),
    maxChildrenPerParent: asNumber(record.maxChildrenPerParent, 0),
    isBounded: asBool(record.isBounded, false),
    ...(record.cardinalitySource
      ? { cardinalitySource: record.cardinalitySource as RelationshipModel['cardinalitySource'] }
      : {}),
    ...(record.forceEmbed ? { forceEmbed: true } : {}),
    ...(record.embedDirectionReversed ? { embedDirectionReversed: true } : {}),
  };
}

/** True when a parsed JSON value looks like SqlStructuralModel (not JSON Schema). */
export function isSqlStructuralModelRecord(value: unknown): value is SqlStructuralModel {
  const record = asRecord(value);
  const tables = record.tables;
  if (!Array.isArray(tables) || tables.length === 0) return false;
  return tables.every((entry) => parseTableModel(entry) !== null);
}

/** True when JSON is a Migration Studio diagram export (`version` + `model.tables`). */
export function isHvyMetlDiagramExportRecord(value: unknown): boolean {
  const record = asRecord(value);
  if (typeof record.version !== 'number') return false;
  return isSqlStructuralModelRecord(record.model);
}

export function normalizeSqlStructuralModel(
  raw: SqlStructuralModel,
  sourceLabel?: string,
): SqlStructuralModel {
  const tables = raw.tables
    .map((entry) => parseTableModel(entry))
    .filter((table): table is TableModel => table !== null);

  const relationships = (raw.relationships ?? [])
    .map((entry) => parseRelationshipModel(entry))
    .filter((rel): rel is RelationshipModel => rel !== null);

  const source = asString(raw.source).trim() || sourceLabel || 'json:import';

  return { source, tables, relationships };
}

export type StructuralModelJsonImport = {
  model: SqlStructuralModel;
  /** SQL DDL when the bundle included it or was synthesized from the model. */
  ddlText?: string;
  /** Dialect from diagram export metadata. */
  dialect?: string;
};

/**
 * Parse JSON text into a structural model when it is a diagram export or raw SqlStructuralModel.
 * Returns null when the document is not a structural model shape (e.g. JSON Schema).
 */
export function parseStructuralModelJsonImport(
  jsonText: string,
  sourceLabel = 'json:import',
): StructuralModelJsonImport | null {
  const normalized = normalizeJsonSchemaPaste(jsonText);
  if (!normalized.startsWith('{')) return null;

  let root: unknown;
  try {
    root = parseJsonSchemaRootDocument(normalized);
  } catch {
    return null;
  }

  const record = asRecord(root);

  if (isHvyMetlDiagramExportRecord(root)) {
    const model = normalizeSqlStructuralModel(record.model as SqlStructuralModel, sourceLabel);
    const ddlFromBundle = asString(record.ddl).trim();
    const dialectRaw = asString(record.dialect).trim();
    const normalizedDialect = dialectRaw ? normalizeDialectId(dialectRaw) : undefined;
    const dialect =
      normalizedDialect && isSupportedDialect(normalizedDialect) ? normalizedDialect : undefined;
    return {
      model,
      ddlText: ddlFromBundle || undefined,
      dialect,
    };
  }

  if (isSqlStructuralModelRecord(root)) {
    const model = normalizeSqlStructuralModel(root as SqlStructuralModel, sourceLabel);
    return { model };
  }

  return null;
}

/** True when pasted text is JSON describing tables (diagram export or SqlStructuralModel). */
export function looksLikeSqlStructuralModelJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const root = parseJsonSchemaRootDocument(trimmed);
    return isHvyMetlDiagramExportRecord(root) || isSqlStructuralModelRecord(root);
  } catch {
    return false;
  }
}
