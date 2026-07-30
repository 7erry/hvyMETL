/**
 * Parse JSON Schema documents (draft 2020-12) into SqlStructuralModel for Migration Studio.
 * Supports hvyMETL bundle format `{ description?, schemas: [...] }` and single root schemas.
 * Inspired by examples at https://json-schema.org/learn/json-schema-examples
 */

import type { ColumnModel, ForeignKeyModel, RelationshipModel, SqlStructuralModel, TableModel } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
): TableModel {
  const name = schemaDocumentToTableName(schema);
  registerSchemaIdentifiers(schema, name, idBySchemaId, defKey);

  const properties = asRecord(schema.properties);
  const required = new Set(
    (Array.isArray(schema.required) ? schema.required : []).map((entry) => String(entry)),
  );

  const primaryKey = [...required];
  if (primaryKey.length === 0) {
    const idProp =
      Object.keys(properties).find((key) => /^id$/i.test(key))
      ?? Object.keys(properties).find((key) => /Id$/.test(key));
    if (idProp) primaryKey.push(idProp);
    else if (Object.keys(properties).length > 0) primaryKey.push(Object.keys(properties)[0]!);
  }

  const foreignKeys: ForeignKeyModel[] = [];
  const columns: ColumnModel[] = [];

  for (const [propertyName, propertySpec] of Object.entries(properties)) {
    const spec = asRecord(propertySpec);
    const isPrimaryKey = primaryKey.includes(propertyName);

    if (typeof spec.$ref === 'string') {
      const target = resolveRefTarget(spec.$ref, idBySchemaId);
      columns.push({
        name: propertyName,
        sqlType: 'VARCHAR(64)',
        bsonType: 'objectId',
        nullable: !isPrimaryKey,
        isPrimaryKey,
      });
      if (target) {
        foreignKeys.push({
          column: propertyName,
          referencesTable: target.table,
          referencesColumn: target.column,
        });
      }
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

/** Pull object-shaped entries from a document `$defs` map (draft 2020-12). */
function objectSchemasFromDefs(defs: Record<string, unknown>): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];

  for (const [defKey, defValue] of Object.entries(defs)) {
    const def = asRecord(defValue);
    if (def.type !== 'object' && !def.properties) continue;
    schemas.push({
      ...def,
      title: String(def.title ?? defKey),
    });
  }

  return schemas;
}

/** Extract schema objects from pasted JSON text. */
export function parseJsonSchemaDocuments(jsonText: string): Record<string, unknown>[] {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    throw new Error('JSON Schema document is empty.');
  }

  let document: unknown;
  try {
    document = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('JSON Schema import must be valid JSON.');
  }

  const root = asRecord(document);
  if (Array.isArray(root.schemas)) {
    const schemas = root.schemas.map((entry) => asRecord(entry)).filter((entry) => entry.type === 'object' || entry.properties);
    if (schemas.length === 0) {
      throw new Error('JSON Schema bundle must include at least one object schema in "schemas".');
    }
    return schemas;
  }

  const defs = asRecord(root.$defs);
  const fromDefs = objectSchemasFromDefs(defs);
  if (fromDefs.length > 0) {
    return fromDefs;
  }

  if (root.type === 'object' || root.properties) {
    return [root];
  }

  throw new Error(
    'JSON Schema import must be an object schema, a { "schemas": [...] } bundle, or a document with object-shaped "$defs".',
  );
}

type SchemaDocumentEntry = {
  schema: Record<string, unknown>;
  defKey?: string;
};

function listSchemaDocumentEntries(jsonText: string): SchemaDocumentEntry[] {
  const trimmed = jsonText.trim();
  const document = JSON.parse(trimmed) as unknown;
  const root = asRecord(document);

  if (Array.isArray(root.schemas)) {
    return root.schemas
      .map((entry) => asRecord(entry))
      .filter((entry) => entry.type === 'object' || entry.properties)
      .map((schema) => ({ schema }));
  }

  const defs = asRecord(root.$defs);
  const entries: SchemaDocumentEntry[] = [];
  for (const [defKey, defValue] of Object.entries(defs)) {
    const def = asRecord(defValue);
    if (def.type !== 'object' && !def.properties) continue;
    entries.push({
      schema: {
        ...def,
        title: String(def.title ?? defKey),
      },
      defKey,
    });
  }
  if (entries.length > 0) {
    return entries;
  }

  if (root.type === 'object' || root.properties) {
    return [{ schema: root }];
  }

  return [];
}

/** Convert JSON Schema bundle text into the shared structural model. */
export function parseJsonSchemaToModel(jsonText: string, sourceLabel = 'ddl:json-schema'): SqlStructuralModel {
  const entries = listSchemaDocumentEntries(jsonText);
  if (entries.length === 0) {
    throw new Error(
      'JSON Schema import must be an object schema, a { "schemas": [...] } bundle, or a document with object-shaped "$defs".',
    );
  }

  const idBySchemaId = new Map<string, string>();

  for (const { schema, defKey } of entries) {
    const name = schemaDocumentToTableName(schema);
    registerSchemaIdentifiers(schema, name, idBySchemaId, defKey);
  }

  const tables = entries.map(({ schema, defKey }) => buildTableFromSchema(schema, idBySchemaId, defKey));
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
  if (sql.includes('BOOL')) {
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
