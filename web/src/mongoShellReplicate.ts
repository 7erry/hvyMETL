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

export type SameReplicateDestinationInput = {
  sourceConnectionId?: string | null;
  targetConnectionId?: string | null;
  sourceUri: string;
  targetUri: string;
  sourceDb: string;
  targetDb: string;
  sourceCollection: string;
  targetCollection: string;
};

/** True when replicate would read and write the same collection (same conn/URI, db, name). */
export function isSameReplicateDestination(input: SameReplicateDestinationInput): boolean {
  const sourceUri = input.sourceUri.trim();
  const targetUri = input.targetUri.trim();
  const sourceDb = input.sourceDb.trim();
  const targetDb = input.targetDb.trim();
  const sourceCollection = input.sourceCollection.trim();
  const targetCollection = input.targetCollection.trim() || sourceCollection;
  if (!sourceDb || !targetDb || !sourceCollection) return false;

  const sameConnection =
    (Boolean(input.sourceConnectionId) &&
      input.sourceConnectionId === input.targetConnectionId) ||
    (Boolean(sourceUri) && sourceUri === targetUri);

  return sameConnection && sourceDb === targetDb && sourceCollection === targetCollection;
}

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
  return `// --- Configuration & Connections ---
const BATCH_SIZE = ${batchSize}; // Tunable via UI; balance BSON payload size and throughput
const MAX_RETRIES = 3;

const sourceDB = db.getSiblingDB(${JSON.stringify(sourceDb)});
const targetConn = new Mongo(${JSON.stringify(targetUri)});
const targetDB = targetConn.getDB(${JSON.stringify(targetDb)});

const sourceColl = sourceDB.getCollection(${JSON.stringify(sourceCollection)});
const targetColl = targetDB.getCollection(${JSON.stringify(targetCollection)});

// --- Retry-Aware Bulk Writer ---
function flushBatchWithRetry(batch, attempt = 1) {
  if (batch.length === 0) return 0;

  const ops = batch.map((doc) =>
    doc._id != null
      ? { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }
      : { insertOne: { document: doc } }
  );

  try {
    targetColl.bulkWrite(ops, { ordered: false });
    return batch.length;
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      const backoffMs = attempt * 1500;
      print(\`[Warning] bulkWrite failed (attempt \${attempt}/\${MAX_RETRIES}). Retrying in \${backoffMs}ms... Error: \${err.message}\`);
      sleep(backoffMs);
      return flushBatchWithRetry(batch, attempt + 1);
    }
    print(\`[Error] Unrecoverable error writing batch: \${err.message}\`);
    throw err;
  }
}

// --- Execution & Streaming ---
const totalDocs = sourceColl.estimatedDocumentCount();
print(\`Starting migration of ~\${totalDocs} documents...\`);

const startTime = Date.now();
let copied = 0;
let batch = [];

// mongosh find(filter, projection) — never pass driver options as the 2nd arg
const cursor = sourceColl.find({}).batchSize(BATCH_SIZE);

try {
  while (cursor.hasNext()) {
    batch.push(cursor.next());

    if (batch.length >= BATCH_SIZE) {
      copied += flushBatchWithRetry(batch);
      batch = [];

      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = Math.round(copied / (elapsedSec || 1));
      const pct = totalDocs > 0 ? ((copied / totalDocs) * 100).toFixed(1) : "?";
      print(\`[Progress] \${copied}/\${totalDocs} (\${pct}%) — \${rate} docs/sec\`);
    }
  }

  if (batch.length > 0) {
    copied += flushBatchWithRetry(batch);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  print(\`\\nTransfer complete! Upserted \${copied} documents in \${duration}s.\`);

} finally {
  cursor.close();
}
`;
}
