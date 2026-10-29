/** Build a mongosh script that copies one collection between two deployments. */

import { parseShellJsonOutput } from './mongoShellResultModel';

export const MONGO_SHELL_REPLICATE_TIMEOUT_MS = 15 * 60 * 1000;

function namesFromUnknownList(items: unknown[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const name = (item as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) names.push(name.trim());
    }
  }
  return names;
}

function namesFromParsedValue(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    const names = namesFromUnknownList(parsed);
    // Ignore empty arrays — parseShellJsonOutput prefers the last array and can latch onto fields: []
    return names;
  }
  if (parsed && typeof parsed === 'object') {
    const collections = (parsed as { collections?: unknown }).collections;
    if (Array.isArray(collections)) return namesFromUnknownList(collections);
  }
  return [];
}

/** Collection names from mongosh list/introspect stdout. */
export function collectionNamesFromShellOutput(stdout: string): string[] {
  const text = stdout.trim();
  if (!text) return [];

  try {
    const direct = namesFromParsedValue(JSON.parse(text) as unknown);
    if (direct.length > 0) return direct;
  } catch {
    // mongosh may prefix warnings — fall through
  }

  // Prefer an object with collections[], then the longest non-empty name list (never empty []).
  let best: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j]!;
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) continue;
    const slice = text.slice(i, end + 1);
    try {
      const names = namesFromParsedValue(JSON.parse(slice) as unknown);
      if (names.length > best.length) best = names;
    } catch {
      // keep scanning
    }
    i = end;
  }
  if (best.length > 0) return best;

  const fallback = namesFromParsedValue(parseShellJsonOutput(stdout));
  return fallback;
}

const SYSTEM_DB_NAMES = new Set(['admin', 'local', 'config']);

/** Database names from listDatabases mongosh stdout. */
export function databaseNamesFromShellOutput(stdout: string): string[] {
  const parsed = parseShellJsonOutput(stdout);
  const raw: string[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) raw.push(item.trim());
      else if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
        const name = (item as { name: string }).name.trim();
        if (name) raw.push(name);
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    const databases = (parsed as { databases?: unknown }).databases;
    if (Array.isArray(databases)) {
      for (const item of databases) {
        if (typeof item === 'string' && item.trim()) raw.push(item.trim());
        else if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
          const name = (item as { name: string }).name.trim();
          if (name) raw.push(name);
        }
      }
    }
  }
  const unique = [...new Set(raw)];
  const preferred = unique.filter((name) => !SYSTEM_DB_NAMES.has(name));
  return (preferred.length > 0 ? preferred : unique).sort((a, b) => a.localeCompare(b));
}

export type CollectionReplicateOptions = {
  targetUri: string;
  sourceDb: string;
  targetDb: string;
  sourceCollection: string;
  targetCollection: string;
  batchSize?: number;
};

/** mongosh --file script: primary URI is source; `Mongo(targetUri)` is destination. */
export function buildCollectionReplicateScript(options: CollectionReplicateOptions): string {
  const targetUri = options.targetUri.trim();
  const sourceDb = options.sourceDb.trim();
  const targetDb = options.targetDb.trim();
  const sourceCollection = options.sourceCollection.trim();
  const targetCollection = options.targetCollection.trim() || sourceCollection;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 1000));

  if (!targetUri) throw new Error('Target MongoDB URI is required.');
  if (!sourceDb) throw new Error('Source database is required.');
  if (!targetDb) throw new Error('Target database is required.');
  if (!sourceCollection) throw new Error('Source collection is required.');

  // Upsert by _id so re-runs do not fail with E11000 duplicate key.
  return `// Replicate ${sourceCollection} → ${targetCollection} (${sourceDb} → ${targetDb})
const sourceDB = db.getSiblingDB(${JSON.stringify(sourceDb)});
const targetDB = new Mongo(${JSON.stringify(targetUri)}).getDB(${JSON.stringify(targetDb)});
const sourceColl = sourceDB.getCollection(${JSON.stringify(sourceCollection)});
const targetColl = targetDB.getCollection(${JSON.stringify(targetCollection)});

function flushBatch(batch) {
  if (batch.length === 0) return 0;
  const ops = batch.map((doc) =>
    doc._id != null
      ? { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }
      : { insertOne: { document: doc } },
  );
  targetColl.bulkWrite(ops, { ordered: false });
  return batch.length;
}

const cursor = sourceColl.find({});
let batch = [];
const BATCH_SIZE = ${batchSize};
let copied = 0;

while (cursor.hasNext()) {
  batch.push(cursor.next());
  if (batch.length === BATCH_SIZE) {
    copied += flushBatch(batch);
    batch = [];
  }
}

copied += flushBatch(batch);
print("Transfer complete. Upserted/wrote " + copied + " documents.");
`;
}
