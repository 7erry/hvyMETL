/**
 * Project Extended JSON documents and load them with mongoimport.
 * SQL sources stay on csvToAtlas.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BSON } from 'mongodb';
import type { ExtendedJsonRecord } from './mongoExtendedJson.js';
import { iterateExtendedJsonFile, iterateExtendedJsonText } from './mongoExtendedJson.js';
import { runMongoImport, type MongoImportSpawn } from './mongoImport.js';

const DEFAULT_BATCH_SIZE = 500;

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
};

export type JsonBulkWriteResult = {
  inserted: number;
  errors: string[];
};

/**
 * Keep fields the plan still has. A rename that changes the key away from the
 * source JSON key is not applied: ColumnModel has no original-name map.
 */
export function projectDocument(document: Record<string, unknown>, schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const properties = schemaProperties(schema);
  if (!properties) return document;
  return projectObject(document, properties);
}

function schemaProperties(schema: Record<string, unknown> | JsonSchemaNode | undefined): Record<string, JsonSchemaNode> | null {
  if (!schema || typeof schema !== 'object') return null;
  const properties = (schema as JsonSchemaNode).properties;
  if (!properties || typeof properties !== 'object') return null;
  const keys = Object.keys(properties);
  if (keys.length === 0) return null;
  return properties;
}

function projectObject(document: Record<string, unknown>, properties: Record<string, JsonSchemaNode>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in document)) continue;
    next[key] = projectValue(document[key], propertySchema);
  }
  return next;
}

function projectValue(value: unknown, schema: JsonSchemaNode): unknown {
  if (Array.isArray(value) && schema.items) {
    const itemProperties = schemaProperties(schema.items);
    if (!itemProperties) return value;
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return projectObject(item as Record<string, unknown>, itemProperties);
    });
  }
  const nested = schemaProperties(schema);
  if (nested && value && typeof value === 'object' && !Array.isArray(value)) {
    return projectObject(value as Record<string, unknown>, nested);
  }
  return value;
}

function partialInserted(error: unknown): number {
  if (!error || typeof error !== 'object' || !('result' in error)) return 0;
  const result = (error as { result?: { insertedCount?: number } }).result;
  return typeof result?.insertedCount === 'number' ? result.insertedCount : 0;
}

/**
 * Insert documents in batches. Lenient mode records a bad line and continues.
 * Strict mode stops on the first malformed record or failed batch.
 */
export async function writeExtendedJsonBatches(
  records: Iterable<ExtendedJsonRecord> | AsyncIterable<ExtendedJsonRecord>,
  options: {
    strict: boolean;
    schema?: Record<string, unknown>;
    batchSize?: number;
    insertMany: (docs: Record<string, unknown>[]) => Promise<{ insertedCount?: number }>;
  },
): Promise<JsonBulkWriteResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const batch: Record<string, unknown>[] = [];
  let inserted = 0;
  const errors: string[] = [];

  const flush = async (): Promise<boolean> => {
    if (batch.length === 0) return true;
    const docs = batch.splice(0, batch.length);
    try {
      const result = await options.insertMany(docs);
      inserted += result.insertedCount ?? docs.length;
      return true;
    } catch (error) {
      inserted += partialInserted(error);
      errors.push(error instanceof Error ? error.message : String(error));
      return !options.strict;
    }
  };

  for await (const record of records) {
    if (!record.ok) {
      const keepGoing = await flush();
      errors.push(`Line ${record.line}: ${record.error}`);
      if (!keepGoing || options.strict) break;
      continue;
    }
    batch.push(projectDocument(record.value, options.schema));
    if (batch.length >= batchSize) {
      const keepGoing = await flush();
      if (!keepGoing) break;
    }
  }

  await flush();
  return { inserted, errors };
}

function ndjsonFileName(collection: string): string {
  const safe = collection.replace(/[^A-Za-z0-9._-]+/g, '_') || 'documents';
  return `${safe}.ndjson`;
}

/** Read NDJSON or a JSON array, project it, and mongoimport one collection. */
export async function loadMongoJsonIntoCollection(options: {
  uri: string;
  database: string;
  collection: string;
  schema?: Record<string, unknown>;
  text?: string;
  filePath?: string;
  /** Already-parsed documents. Used when one JSON object holds several collections. */
  documents?: Record<string, unknown>[];
  /** Run directory that receives the NDJSON file mongoimport reads. */
  ndjsonDir: string;
  strict: boolean;
  drop: boolean;
  env?: NodeJS.ProcessEnv;
  spawnImport?: MongoImportSpawn;
}): Promise<JsonBulkWriteResult> {
  if (!options.filePath && !options.text?.trim() && !options.documents) {
    return { inserted: 0, errors: ['MongoDB JSON load has no documents.'] };
  }
  const records = options.documents
    ? options.documents.map((value, index) => ({ ok: true as const, value, line: index + 1 }))
    : options.filePath
      ? iterateExtendedJsonFile(options.filePath)
      : iterateExtendedJsonText(options.text ?? '');
  const collected: Record<string, unknown>[] = [];
  const batched = await writeExtendedJsonBatches(records, {
    strict: options.strict,
    schema: options.schema,
    insertMany: async (docs) => {
      collected.push(...docs);
      return { insertedCount: docs.length };
    },
  });
  if (collected.length === 0) {
    return {
      inserted: 0,
      errors: batched.errors.length > 0 ? batched.errors : ['MongoDB JSON load has no documents.'],
    };
  }

  mkdirSync(options.ndjsonDir, { recursive: true });
  const filePath = join(options.ndjsonDir, ndjsonFileName(options.collection));
  const body = `${collected.map((doc) => BSON.EJSON.stringify(doc, { relaxed: false })).join('\n')}\n`;
  writeFileSync(filePath, body);

  const imported = runMongoImport({
    uri: options.uri,
    database: options.database,
    collection: options.collection,
    filePath,
    drop: options.drop,
    stopOnError: options.strict,
    mode: 'insert',
    env: options.env,
    spawnImport: options.spawnImport,
  });
  const errors = [...batched.errors];
  if (!imported.ok && imported.error) errors.push(imported.error);
  return { inserted: imported.insertedCount ?? 0, errors };
}
