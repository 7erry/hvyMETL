/**
 * Infer SqlStructuralModel from MongoDB documents.
 * One document shape is one table. Nested objects and arrays stay on that table.
 * A single object whose values are all arrays of documents is one table per array.
 */

import type { ColumnModel, SqlStructuralModel, TableModel } from '../types.js';
import {
  MONGO_JSON_INFER_DOC_CAP,
  bsonTypeName,
  isExtendedJsonDocument,
  iterateExtendedJsonText,
} from './mongoExtendedJson.js';

const SQL_TYPE_FOR_BSON: Record<string, string> = {
  objectId: 'VARCHAR(24)',
  date: 'TIMESTAMP',
  long: 'BIGINT',
  decimal: 'DECIMAL',
  int: 'INTEGER',
  double: 'DOUBLE',
  bool: 'BOOLEAN',
  string: 'VARCHAR(255)',
  object: 'JSON',
  array: 'JSON',
  mixed: 'JSON',
  timestamp: 'TIMESTAMP',
  binData: 'BLOB',
};

type FieldNode = {
  types: Set<string>;
  present: number;
  nulls: number;
  fields: Map<string, FieldNode>;
  element: FieldNode | null;
  arrayKind: 'none' | 'object' | 'scalar' | 'mixed';
  objectDocs: number;
  childItemCount: number;
  maxChildren: number;
};

function emptyNode(): FieldNode {
  return {
    types: new Set(),
    present: 0,
    nulls: 0,
    fields: new Map(),
    element: null,
    arrayKind: 'none',
    objectDocs: 0,
    childItemCount: 0,
    maxChildren: 0,
  };
}

function ensureField(fields: Map<string, FieldNode>, name: string): FieldNode {
  const existing = fields.get(name);
  if (existing) return existing;
  const created = emptyNode();
  fields.set(name, created);
  return created;
}

function observe(node: FieldNode, value: unknown): void {
  if (value === null || value === undefined) {
    node.nulls += 1;
    return;
  }
  if (isExtendedJsonDocument(value)) {
    node.types.add('object');
    node.objectDocs += 1;
    for (const [key, child] of Object.entries(value)) {
      const field = ensureField(node.fields, key);
      field.present += 1;
      observe(field, child);
    }
    return;
  }
  if (Array.isArray(value)) {
    node.types.add('array');
    const element = node.element ?? (node.element = emptyNode());
    let objects = 0;
    for (const item of value) {
      const itemIsDocument = isExtendedJsonDocument(item);
      if (node.arrayKind === 'none') node.arrayKind = itemIsDocument ? 'object' : 'scalar';
      else if (item !== null && item !== undefined && (node.arrayKind === 'object') !== itemIsDocument) {
        node.arrayKind = 'mixed';
      }
      observe(element, item);
      if (itemIsDocument) objects += 1;
    }
    node.childItemCount += objects;
    node.maxChildren = Math.max(node.maxChildren, objects);
    return;
  }
  node.types.add(bsonTypeName(value));
}

function observeRoot(root: FieldNode, document: Record<string, unknown>): void {
  root.types.add('object');
  root.objectDocs += 1;
  for (const [key, value] of Object.entries(document)) {
    const field = ensureField(root.fields, key);
    field.present += 1;
    observe(field, value);
  }
}

/** File name stem, or `documents` when the paste has no file name. */
export function collectionNameFromLabel(sourceLabel: string): string {
  const base = sourceLabel.split(/[/\\]/).pop() ?? sourceLabel;
  const file = base.match(/^(.+)\.(json|ndjson)$/i);
  if (!file?.[1]) return 'documents';
  const slug = file[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'documents';
}

function nonNullTypes(node: FieldNode): string[] {
  return [...node.types].filter((type) => type !== 'null').sort();
}

function columnFor(name: string, node: FieldNode, parentDocs: number, primaryKey: boolean): ColumnModel {
  const types = nonNullTypes(node);
  const mixed = types.length > 1;
  const bsonType = mixed ? 'mixed' : (types[0] ?? 'string');
  const column: ColumnModel = {
    name,
    sqlType: SQL_TYPE_FOR_BSON[bsonType] ?? 'VARCHAR(255)',
    bsonType,
    nullable: !primaryKey && (node.nulls > 0 || node.present < parentDocs),
    isPrimaryKey: primaryKey,
  };
  if (mixed) column.observedBsonTypes = types;
  return column;
}

function choosePrimaryKey(fields: Map<string, FieldNode>): string | undefined {
  if (fields.has('_id')) return '_id';
  if (fields.has('id')) return 'id';
  return fields.keys().next().value;
}

function tableNameFromKey(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'documents';
}

/** Arrays of documents under one object, or null when the value is a normal document. */
export function collectionGroupsFromDocument(
  document: Record<string, unknown>,
): { name: string; documents: Record<string, unknown>[] }[] | null {
  const entries = Object.entries(document);
  if (entries.length === 0) return null;
  const groups: { name: string; documents: Record<string, unknown>[] }[] = [];
  for (const [key, value] of entries) {
    if (!Array.isArray(value)) return null;
    const documents: Record<string, unknown>[] = [];
    for (const item of value) {
      if (!isExtendedJsonDocument(item)) return null;
      documents.push(item);
    }
    if (documents.length > 0) groups.push({ name: tableNameFromKey(key), documents });
  }
  return groups.length > 0 ? groups : null;
}

/** One JSON object of document arrays, or null for NDJSON, a JSON array, or a normal document. */
export function mongoJsonCollectionGroups(
  text: string,
): { name: string; documents: Record<string, unknown>[] }[] | null {
  const iterator = iterateExtendedJsonText(text);
  const first = iterator.next();
  if (first.done || !first.value.ok) return null;
  if (!iterator.next().done) return null;
  return collectionGroupsFromDocument(first.value.value);
}

function tableFromDocuments(tableName: string, documents: Record<string, unknown>[]): TableModel {
  const root = emptyNode();
  const observed = Math.min(documents.length, MONGO_JSON_INFER_DOC_CAP);
  for (let index = 0; index < observed; index += 1) {
    const document = documents[index];
    if (document) observeRoot(root, document);
  }
  return buildTable(tableName, root.fields, root.objectDocs, documents.length);
}

function buildTable(
  tableName: string,
  fields: Map<string, FieldNode>,
  observedDocs: number,
  rowCount: number,
): TableModel {
  const primaryKeyName = choosePrimaryKey(fields);
  const columns = [...fields].map(([name, node]) => columnFor(name, node, observedDocs, name === primaryKeyName));
  return {
    name: tableName,
    columns,
    primaryKey: primaryKeyName ? [primaryKeyName] : [],
    foreignKeys: [],
    rowCount,
  };
}

/**
 * Build the structural model from document text.
 * A malformed record fails the import. Mixed BSON types stay on the column.
 */
export function parseMongoJsonToModel(text: string, sourceLabel: string): SqlStructuralModel {
  const root = emptyNode();
  let rowCount = 0;
  let first: Record<string, unknown> | null = null;

  for (const record of iterateExtendedJsonText(text)) {
    if (!record.ok) {
      throw new Error(`Malformed MongoDB JSON at line ${record.line}: ${record.error}`);
    }
    rowCount += 1;
    if (rowCount === 1) first = record.value;
    if (rowCount <= MONGO_JSON_INFER_DOC_CAP) observeRoot(root, record.value);
  }

  if (rowCount === 0) {
    throw new Error('MongoDB JSON import did not contain any documents.');
  }

  const groups = rowCount === 1 && first ? collectionGroupsFromDocument(first) : null;
  if (groups) {
    return {
      source: sourceLabel,
      tables: groups.map((group) => tableFromDocuments(group.name, group.documents)),
      relationships: [],
    };
  }

  return {
    source: sourceLabel,
    tables: [buildTable(collectionNameFromLabel(sourceLabel), root.fields, root.objectDocs, rowCount)],
    relationships: [],
  };
}

/** One table per sampled collection. Empty collections are skipped. */
export function modelFromMongoCollections(
  collections: { name: string; documents: Record<string, unknown>[] }[],
  sourceLabel: string,
): SqlStructuralModel {
  const tables = collections
    .filter((collection) => collection.documents.length > 0)
    .map((collection) => tableFromDocuments(tableNameFromKey(collection.name), collection.documents));
  if (tables.length === 0) {
    throw new Error('MongoDB database has no documents to infer a schema from.');
  }
  return { source: sourceLabel, tables, relationships: [] };
}
