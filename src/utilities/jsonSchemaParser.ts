/**
 * Parse JSON Schema documents (draft 2020-12) into SqlStructuralModel for Migration Studio.
 * Supports hvyMETL bundle format `{ description?, schemas: [...] }` and single root schemas.
 * Inspired by examples at https://json-schema.org/learn/json-schema-examples
 */

import { sqlTypeToBsonType } from './sqlTypeToBsonType.js';
import type { ColumnModel, ForeignKeyModel, RelationshipModel, SqlStructuralModel, TableModel } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Strip BOM, fenced markdown blocks, and stray `null`/`false`/`true` before `{`. */
export function normalizeJsonSchemaPaste(raw: string): string {
  let text = raw.trim().replace(/^\uFEFF/, '');
  const fenced = text.match(/^```(?:json|json-schema)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  if (fenced) {
    text = fenced[1]!.trim();
  }
  text = text.replace(/^(?:null|false|true)\s*(?=[{\[])/i, '');
  return text;
}

function extractBalancedJsonSlice(text: string, startIndex: number): string | null {
  const open = text[startIndex];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }

  return null;
}

/** Parse pasted JSON Schema text, tolerating common copy/paste noise before the root object. */
export function parseJsonSchemaRootDocument(jsonText: string): unknown {
  const normalized = normalizeJsonSchemaPaste(jsonText);
  if (!normalized) {
    throw new Error('JSON Schema document is empty.');
  }

  try {
    return JSON.parse(normalized);
  } catch (firstError) {
    const objectStart = normalized.indexOf('{');
    const arrayStart = normalized.indexOf('[');
    let start = -1;
    if (objectStart >= 0 && arrayStart >= 0) start = Math.min(objectStart, arrayStart);
    else start = Math.max(objectStart, arrayStart);

    if (start >= 0) {
      const slice = extractBalancedJsonSlice(normalized, start);
      if (slice) {
        try {
          return JSON.parse(slice);
        } catch {
          // fall through to error below
        }
      }
    }

    const detail = firstError instanceof Error ? firstError.message : String(firstError);
    throw new Error(`JSON Schema import must be valid JSON. ${detail}`);
  }
}

function looksLikeStructuralModelJsonRoot(root: Record<string, unknown>): boolean {
  if (typeof root.version === 'number') {
    const nested = asRecord(root.model);
    if (Array.isArray(nested.tables) && nested.tables.length > 0) return true;
  }
  const tables = root.tables;
  if (!Array.isArray(tables) || tables.length === 0) return false;
  return tables.every((entry) => {
    const table = asRecord(entry);
    return Boolean(asString(table.name).trim()) && Array.isArray(table.columns) && table.columns.length > 0;
  });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isObjectSchema(schema: Record<string, unknown>): boolean {
  return schema.type === 'object' || Boolean(schema.properties);
}

/** True when pasted text is JSON Schema (bundle, root object schema, or $defs document). */
export function looksLikeJsonSchemaImport(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.includes('{') && !trimmed.includes('[')) return false;

  try {
    const root = asRecord(parseJsonSchemaRootDocument(content));
    if (looksLikeStructuralModelJsonRoot(root)) return false;
    if (Array.isArray(root.schemas)) return true;
    if (String(root.$schema ?? '').includes('json-schema.org')) return true;
    if (isObjectSchema(root)) return true;
    return Object.values(asRecord(root.$defs)).some((entry) => isObjectSchema(asRecord(entry)));
  } catch {
    return false;
  }
}

/**
 * JSON Schema document: `$schema` on json-schema.org, or a `$defs` / `definitions` map.
 * Narrower than looksLikeJsonSchemaImport so a Mongo document that only has `properties` stays MongoDB JSON.
 */
export function looksLikeJsonSchemaDocument(content: string): boolean {
  const trimmed = content.trim();
  // Skip the parse when the paste has no schema keywords, so MongoDB JSON is not parsed twice.
  if (!/"\$schema"\s*:/.test(trimmed) && !/"\$defs"\s*:/.test(trimmed) && !/"definitions"\s*:/.test(trimmed)) {
    return false;
  }

  try {
    const root = asRecord(parseJsonSchemaRootDocument(content));
    if (looksLikeStructuralModelJsonRoot(root)) return false;
    if (String(root.$schema ?? '').includes('json-schema.org')) return true;
    return Object.keys(asRecord(root.$defs)).length > 0 || Object.keys(asRecord(root.definitions)).length > 0;
  } catch {
    return false;
  }
}

/** Slug from $id URL, title, or $defs key for table naming. */
export function schemaDocumentToTableName(schema: Record<string, unknown>): string {
  const title = String(schema.title ?? '').trim();
  if (title) return title;

  const id = String(schema.$id ?? '').trim();
  if (id) {
    const segment = id.split('/').pop()?.replace(/\.schema\.json$/i, '') ?? id;
    return segment.replace(/-/g, '_');
  }

  return 'Document';
}

/** Register $id, $anchor, and JSON Pointer keys for $ref resolution. */
function registerSchemaIdentifiers(
  schema: Record<string, unknown>,
  tableName: string,
  idBySchemaId: Map<string, string>,
  defKey?: string,
): void {
  const id = String(schema.$id ?? '').trim();
  if (id) {
    idBySchemaId.set(id, tableName);
  }

  const anchor = String(schema.$anchor ?? '').trim();
  if (anchor) {
    idBySchemaId.set(`#${anchor}`, tableName);
  }

  if (defKey) {
    idBySchemaId.set(`#/$defs/${defKey}`, tableName);
    idBySchemaId.set(`#/definitions/${defKey}`, tableName);
  }
}

/** Canonical $id for a table when exporting from a structural model. */
export function tableNameToSchemaId(tableName: string): string {
  const slug = tableName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://example.com/${slug || 'document'}.schema.json`;
}

function resolveRefTarget(ref: string, idBySchemaId: Map<string, string>): { table: string; column: string } | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const direct = idBySchemaId.get(trimmed);
  if (direct) {
    return { table: direct, column: 'id' };
  }

  if (trimmed.startsWith('#/')) {
    const pointer = idBySchemaId.get(trimmed);
    if (pointer) {
      return { table: pointer, column: 'id' };
    }
  }

  const segment = trimmed.split('/').pop()?.replace(/\.schema\.json$/i, '') ?? '';
  const guessed = segment.replace(/^#/, '').replace(/-/g, '_');
  if (guessed) {
    return { table: guessed, column: 'id' };
  }

  return null;
}

function resolveJsonSchemaPrimaryType(spec: Record<string, unknown>): string | undefined {
  const typeValue = spec.type;
  if (Array.isArray(typeValue)) {
    return typeValue.find((entry) => entry !== 'null') as string | undefined;
  }
  return typeof typeValue === 'string' ? typeValue : undefined;
}

function isNestedObjectSchema(spec: Record<string, unknown>): boolean {
  const properties = asRecord(spec.properties);
  return resolveJsonSchemaPrimaryType(spec) === 'object' && Object.keys(properties).length > 0;
}

function isArrayOfObjectSchema(spec: Record<string, unknown>): boolean {
  if (resolveJsonSchemaPrimaryType(spec) !== 'array') return false;
  return isNestedObjectSchema(asRecord(spec.items));
}

function nestedChildTableName(parentTable: string, propertyName: string): string {
  return `${parentTable}_${propertyName}`;
}

function parentFkColumnName(parentTable: string): string {
  return `${parentTable}_id`;
}

/** Pick a primary key from required fields, skipping nested structures promoted to child tables. */
function inferTablePrimaryKey(
  properties: Record<string, unknown>,
  required: Set<string>,
  skipProperties: Set<string>,
): string[] {
  if (properties._id !== undefined || required.has('_id')) return ['_id'];
  if (properties.id !== undefined || required.has('id')) return ['id'];

  const eligibleRequired = [...required].filter((name) => !skipProperties.has(name));
  const idLike = eligibleRequired.find((name) => /Id$/i.test(name) || name.endsWith('ID'));
  if (idLike) return [idLike];

  const scalarRequired = eligibleRequired.filter((name) => {
    const spec = asRecord(properties[name]);
    return !isNestedObjectSchema(spec) && !isArrayOfObjectSchema(spec);
  });

  if (scalarRequired.length > 0 && skipProperties.size === 0) {
    return scalarRequired;
  }
  if (scalarRequired.length === 1) return scalarRequired;

  if (eligibleRequired.length > 0) return [eligibleRequired[0]!];

  const idProp =
    Object.keys(properties).find((key) => !skipProperties.has(key) && /^id$/i.test(key))
    ?? Object.keys(properties).find((key) => !skipProperties.has(key) && /Id$/.test(key));
  if (idProp) return [idProp];

  const firstScalar = Object.keys(properties).find((key) => {
    if (skipProperties.has(key)) return false;
    const spec = asRecord(properties[key]);
    return !isNestedObjectSchema(spec) && !isArrayOfObjectSchema(spec);
  });
  return firstScalar ? [firstScalar] : [];
}

type NestedParentLink = {
  parentTable: string;
  parentPrimaryKey: string;
};

function defsByPointer(root: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const bucket of ['$defs', 'definitions']) {
    for (const [key, value] of Object.entries(asRecord(root[bucket]))) {
      map.set(`#/${bucket}/${key}`, asRecord(value));
    }
  }
  return map;
}

/** A `$ref` to a string enum stays a string. A `$ref` to an object schema stays a foreign key. */
function columnForRef(
  propertyName: string,
  ref: string,
  isPrimaryKey: boolean,
  idBySchemaId: Map<string, string>,
  defs: Map<string, Record<string, unknown>>,
): { column: ColumnModel; foreignKey?: ForeignKeyModel } {
  const def = defs.get(ref.trim());
  if (def && !isObjectSchema(def)) {
    return { column: jsonSchemaTypeToColumn(propertyName, def, isPrimaryKey) };
  }

  const target = resolveRefTarget(ref, idBySchemaId);
  const column: ColumnModel = {
    name: propertyName,
    sqlType: 'VARCHAR(64)',
    bsonType: 'objectId',
    nullable: !isPrimaryKey,
    isPrimaryKey,
  };
  if (!target) return { column };
  return {
    column,
    foreignKey: {
      column: propertyName,
      referencesTable: target.table,
      referencesColumn: target.column,
    },
  };
}

/**
 * Expand a single monolithic document schema into multiple logical tables by promoting
 * nested objects and array-of-object properties to child tables with foreign keys.
 */
function expandNestedJsonSchemaToTables(
  schema: Record<string, unknown>,
  tableName: string,
  idBySchemaId: Map<string, string>,
  parentLink?: NestedParentLink,
  defKey?: string,
  defs: Map<string, Record<string, unknown>> = new Map(),
): TableModel[] {
  registerSchemaIdentifiers(schema, tableName, idBySchemaId, defKey);

  const properties = asRecord(schema.properties);
  const required = new Set(
    (Array.isArray(schema.required) ? schema.required : []).map((entry) => String(entry)),
  );

  const extracted = new Set<string>();
  for (const [propertyName, propertySpec] of Object.entries(properties)) {
    const spec = asRecord(propertySpec);
    if (typeof spec.$ref === 'string') continue;
    if (isNestedObjectSchema(spec) || isArrayOfObjectSchema(spec)) {
      extracted.add(propertyName);
    }
  }

  const primaryKey = inferTablePrimaryKey(properties, required, extracted);
  const columns: ColumnModel[] = [];
  const foreignKeys: ForeignKeyModel[] = [];
  const childTables: TableModel[] = [];

  if (parentLink) {
    const fkColumn = parentFkColumnName(parentLink.parentTable);
    foreignKeys.push({
      column: fkColumn,
      referencesTable: parentLink.parentTable,
      referencesColumn: parentLink.parentPrimaryKey,
    });
    columns.push({
      name: fkColumn,
      sqlType: 'VARCHAR(64)',
      bsonType: 'objectId',
      nullable: false,
      isPrimaryKey: false,
    });
  }

  for (const [propertyName, propertySpec] of Object.entries(properties)) {
    const spec = asRecord(propertySpec);

    if (typeof spec.$ref === 'string') {
      const resolved = columnForRef(
        propertyName,
        spec.$ref,
        primaryKey.includes(propertyName),
        idBySchemaId,
        defs,
      );
      columns.push(resolved.column);
      if (resolved.foreignKey) foreignKeys.push(resolved.foreignKey);
      continue;
    }

    if (isNestedObjectSchema(spec)) {
      childTables.push(
        ...expandNestedJsonSchemaToTables(
          spec,
          nestedChildTableName(tableName, propertyName),
          idBySchemaId,
          { parentTable: tableName, parentPrimaryKey: primaryKey[0] ?? '_id' },
          undefined,
          defs,
        ),
      );
      continue;
    }

    if (isArrayOfObjectSchema(spec)) {
      childTables.push(
        ...expandNestedJsonSchemaToTables(
          asRecord(spec.items),
          nestedChildTableName(tableName, propertyName),
          idBySchemaId,
          { parentTable: tableName, parentPrimaryKey: primaryKey[0] ?? '_id' },
          undefined,
          defs,
        ),
      );
      continue;
    }

    columns.push(jsonSchemaTypeToColumn(propertyName, spec, primaryKey.includes(propertyName)));
  }

  for (const pkCol of primaryKey) {
    if (!columns.some((column) => column.name === pkCol) && properties[pkCol]) {
      columns.unshift(jsonSchemaTypeToColumn(pkCol, asRecord(properties[pkCol]), true));
    }
  }

  if (columns.length === 0) {
    columns.push({
      name: 'payload',
      sqlType: 'JSON',
      bsonType: 'object',
      nullable: false,
      isPrimaryKey: primaryKey.length === 0,
    });
  }

  const table: TableModel = {
    name: tableName,
    columns,
    primaryKey: primaryKey.length > 0 ? primaryKey : [columns[0]!.name],
    foreignKeys,
    rowCount: 0,
  };

  return [table, ...childTables];
}

function jsonSchemaTypeToColumn(name: string, spec: Record<string, unknown>, isPrimaryKey: boolean): ColumnModel {
  const typeValue = spec.type;
  const format = String(spec.format ?? '').toLowerCase();
  let sqlType = 'JSON';
  let bsonType = 'object';

  const primaryType = Array.isArray(typeValue) ? typeValue.find((entry) => entry !== 'null') : typeValue;

  switch (primaryType) {
    case 'string':
      sqlType = format === 'date-time' ? 'TIMESTAMP' : format === 'date' ? 'DATE' : 'VARCHAR(255)';
      bsonType = format === 'date-time' || format === 'date' ? 'date' : 'string';
      break;
    case 'integer':
      sqlType = 'INTEGER';
      bsonType = 'int';
      break;
    case 'number':
      sqlType = 'NUMERIC(18,4)';
      bsonType = 'double';
      break;
    case 'boolean':
      sqlType = 'BOOLEAN';
      bsonType = 'bool';
      break;
    case 'array':
      sqlType = 'JSON';
      bsonType = 'array';
      break;
    case 'object':
      sqlType = 'JSON';
      bsonType = 'object';
      break;
    default:
      sqlType = 'VARCHAR(255)';
      bsonType = 'string';
  }

  return {
    name,
    sqlType,
    bsonType,
    nullable: !isPrimaryKey,
    isPrimaryKey,
  };
}

function buildTableFromSchema(
  schema: Record<string, unknown>,
  idBySchemaId: Map<string, string>,
  defKey?: string,
  defs: Map<string, Record<string, unknown>> = new Map(),
): TableModel {
  const name = schemaDocumentToTableName(schema);
  registerSchemaIdentifiers(schema, name, idBySchemaId, defKey);

  const properties = asRecord(schema.properties);
  const required = new Set(
    (Array.isArray(schema.required) ? schema.required : []).map((entry) => String(entry)),
  );

  const primaryKey = inferTablePrimaryKey(properties, required, new Set<string>());

  const foreignKeys: ForeignKeyModel[] = [];
  const columns: ColumnModel[] = [];

  for (const [propertyName, propertySpec] of Object.entries(properties)) {
    const spec = asRecord(propertySpec);
    const isPrimaryKey = primaryKey.includes(propertyName);

    if (typeof spec.$ref === 'string') {
      const resolved = columnForRef(propertyName, spec.$ref, isPrimaryKey, idBySchemaId, defs);
      columns.push(resolved.column);
      if (resolved.foreignKey) foreignKeys.push(resolved.foreignKey);
      continue;
    }

    columns.push(jsonSchemaTypeToColumn(propertyName, spec, isPrimaryKey));
  }

  if (columns.length === 0) {
    columns.push({
      name: 'payload',
      sqlType: 'JSON',
      bsonType: 'object',
      nullable: false,
      isPrimaryKey: true,
    });
  }

  return {
    name,
    columns,
    primaryKey: primaryKey.length > 0 ? primaryKey : [columns[0]!.name],
    foreignKeys,
    rowCount: 0,
  };
}

function defaultRelationshipStats(): Pick<RelationshipModel, 'avgChildrenPerParent' | 'maxChildrenPerParent' | 'isBounded'> {
  return {
    avgChildrenPerParent: 0,
    maxChildrenPerParent: 0,
    isBounded: false,
  };
}

function normalizeForeignKeys(tables: TableModel[]): void {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));

  const findParent = (reference: string): TableModel | undefined => {
    const lowered = reference.toLowerCase();
    const direct = byName.get(lowered);
    if (direct) return direct;
    const slug = lowered.replace(/_/g, '-');
    for (const [key, table] of byName.entries()) {
      if (key.replace(/_/g, '-') === slug) return table;
    }
    return undefined;
  };

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const parent = findParent(fk.referencesTable);
      if (!parent) continue;
      fk.referencesTable = parent.name;
      fk.referencesColumn = parent.primaryKey[0] ?? fk.referencesColumn;
    }
  }
}

function buildRelationships(tables: TableModel[]): RelationshipModel[] {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  const relationships: RelationshipModel[] = [];

  for (const child of tables) {
    for (const fk of child.foreignKeys) {
      const parent = byName.get(fk.referencesTable.toLowerCase());
      if (!parent) continue;
      relationships.push({
        parentTable: parent.name,
        childTable: child.name,
        fkColumn: fk.column,
        ...defaultRelationshipStats(),
      });
    }
  }

  return relationships;
}

type SchemaDocumentEntry = {
  schema: Record<string, unknown>;
  /** Set for a `$defs` / `definitions` entity. Those stay one table; only a lone root schema grows child tables. */
  defKey?: string;
};

const DEF_POINTER = /^#\/(\$defs|definitions)\/([^/]+)$/;

function objectDefEntries(defs: Record<string, unknown>): SchemaDocumentEntry[] {
  const entries: SchemaDocumentEntry[] = [];
  for (const [defKey, defValue] of Object.entries(defs)) {
    const def = asRecord(defValue);
    if (!isObjectSchema(def)) continue;
    entries.push({
      schema: { ...def, title: String(def.title ?? defKey) },
      defKey,
    });
  }
  return entries;
}

/**
 * CMS export: every root property is an array of `#/$defs/<key>` or `#/definitions/<key>`.
 * The table name is the property (`authors`), not the def key (`author`). Any other shape returns null.
 */
function collectionExportEntries(root: Record<string, unknown>): SchemaDocumentEntry[] | null {
  const properties = asRecord(root.properties);
  const names = Object.keys(properties);
  if (names.length === 0) return null;

  const entries: SchemaDocumentEntry[] = [];
  for (const name of names) {
    const spec = asRecord(properties[name]);
    if (resolveJsonSchemaPrimaryType(spec) !== 'array') return null;
    const match = DEF_POINTER.exec(asString(asRecord(spec.items).$ref).trim());
    const bucket = match?.[1];
    const defKey = match?.[2];
    if (!bucket || !defKey) return null;
    const def = asRecord(asRecord(root[bucket])[defKey]);
    if (!isObjectSchema(def)) return null;
    entries.push({ schema: { ...def, title: name }, defKey });
  }
  return entries;
}

function readSchemaDocuments(jsonText: string): { entries: SchemaDocumentEntry[]; explicitBundle: boolean } {
  const root = asRecord(parseJsonSchemaRootDocument(jsonText));
  if (Array.isArray(root.schemas)) {
    const entries = root.schemas
      .map((entry) => asRecord(entry))
      .filter((entry) => isObjectSchema(entry))
      .map((schema) => ({ schema }));
    if (entries.length === 0) {
      throw new Error('JSON Schema bundle must include at least one object schema in "schemas".');
    }
    return { entries, explicitBundle: true };
  }

  const fromProperties = collectionExportEntries(root);
  if (fromProperties) return { entries: fromProperties, explicitBundle: false };

  const fromDefs = objectDefEntries(asRecord(root.$defs));
  if (fromDefs.length > 0) return { entries: fromDefs, explicitBundle: false };

  if (isObjectSchema(root)) return { entries: [{ schema: root }], explicitBundle: false };

  throw new Error(
    'JSON Schema import must be an object schema, a { "schemas": [...] } bundle, or a document with object-shaped "$defs".',
  );
}

/** Extract schema objects from pasted JSON text. Same entries as the model import, including CMS property names. */
export function parseJsonSchemaDocuments(jsonText: string): Record<string, unknown>[] {
  return readSchemaDocuments(jsonText).entries.map((entry) => entry.schema);
}

/**
 * Convert JSON Schema text into the shared structural model.
 * Root arrays of `$ref`s become one table per property name. A `$defs` document without that shape uses the def key.
 * Nested objects stay nested on those tables. A single root schema still expands child tables.
 */
export function parseJsonSchemaToModel(jsonText: string, sourceLabel = 'ddl:json-schema'): SqlStructuralModel {
  const { entries, explicitBundle } = readSchemaDocuments(jsonText);
  const defs = defsByPointer(asRecord(parseJsonSchemaRootDocument(jsonText)));
  const useNestedExpansion = entries.length === 1 && !explicitBundle && !entries[0]!.defKey;

  const idBySchemaId = new Map<string, string>();

  for (const { schema, defKey } of entries) {
    const name = schemaDocumentToTableName(schema);
    registerSchemaIdentifiers(schema, name, idBySchemaId, defKey);
  }

  const tables = useNestedExpansion
    ? expandNestedJsonSchemaToTables(
        entries[0]!.schema,
        schemaDocumentToTableName(entries[0]!.schema),
        idBySchemaId,
        undefined,
        entries[0]!.defKey,
        defs,
      )
    : entries.map(({ schema, defKey }) => buildTableFromSchema(schema, idBySchemaId, defKey, defs));
  normalizeForeignKeys(tables);

  if (tables.length === 0) {
    throw new Error('No object schemas found in JSON Schema import.');
  }

  return {
    source: sourceLabel,
    tables,
    relationships: buildRelationships(tables),
  };
}

function columnToJsonSchemaProperty(column: ColumnModel, table: TableModel): Record<string, unknown> {
  const fk = table.foreignKeys.find((entry) => entry.column === column.name);
  if (fk) {
    return { $ref: tableNameToSchemaId(fk.referencesTable) };
  }

  const sql = column.sqlType.toUpperCase();
  if (sql.includes('TIMESTAMP') || sql.includes('DATETIME')) {
    return { type: 'string', format: 'date-time' };
  }
  if (sql.includes('DATE')) {
    return { type: 'string', format: 'date' };
  }
  if (sql.includes('INT')) {
    return { type: 'integer' };
  }
  if (sql.includes('NUMERIC') || sql.includes('DECIMAL') || sql.includes('DOUBLE') || sql.includes('FLOAT') || sql.includes('REAL')) {
    return { type: 'number' };
  }
  if (sqlTypeToBsonType(column.sqlType) === 'bool') {
    return { type: 'boolean' };
  }
  if (sql.includes('JSON')) {
    return { type: 'array', items: { type: 'string' } };
  }

  return { type: 'string' };
}

/** Serialize a structural model as an hvyMETL JSON Schema bundle (for dialect examples). */
export function sqlModelToJsonSchemaBundle(
  model: SqlStructuralModel,
  description?: string,
): Record<string, unknown> {
  const schemas = model.tables.map((table) => ({
    $id: tableNameToSchemaId(table.name),
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: table.name,
    type: 'object',
    required: [...table.primaryKey],
    properties: Object.fromEntries(
      table.columns.map((column) => [column.name, columnToJsonSchemaProperty(column, table)]),
    ),
  }));

  return {
    ...(description ? { description } : {}),
    schemas,
  };
}

/** Pretty-printed JSON bundle for Migration Studio import. */
export function renderJsonSchemaBundleText(model: SqlStructuralModel, description?: string): string {
  return `${JSON.stringify(sqlModelToJsonSchemaBundle(model, description), null, 2)}\n`;
}
