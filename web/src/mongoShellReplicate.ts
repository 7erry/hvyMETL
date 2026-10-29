/** Build a mongosh script that copies one collection between two deployments. */

import { schemaContextFromIntrospect } from './mongoShellCompletions';
import { parseShellJsonOutput } from './mongoShellResultModel';

export const MONGO_SHELL_REPLICATE_TIMEOUT_MS = 15 * 60 * 1000;

/** Collection names from mongosh list/introspect stdout (tolerant of warnings + array preference). */
export function collectionNamesFromShellOutput(stdout: string): string[] {
  const parsed = parseShellJsonOutput(stdout);
  const fromObject = schemaContextFromIntrospect(parsed);
  if (fromObject && fromObject.collections.length > 0) {
    return fromObject.collections.map((c) => c.name);
  }
  return [];
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

/** mongosh --file script: primary URI is source; `connect(targetUri)` is destination. */
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

  return `// Replicate ${sourceCollection} → ${targetCollection} (${sourceDb} → ${targetDb})
const targetConn = connect(${JSON.stringify(targetUri)});
const sourceDB = db.getSiblingDB(${JSON.stringify(sourceDb)});
const targetDB = targetConn.getDB(${JSON.stringify(targetDb)});
const sourceColl = sourceDB.getCollection(${JSON.stringify(sourceCollection)});
const targetColl = targetDB.getCollection(${JSON.stringify(targetCollection)});

const cursor = sourceColl.find({});
let batch = [];
const BATCH_SIZE = ${batchSize};
let copied = 0;

while (cursor.hasNext()) {
  batch.push(cursor.next());
  if (batch.length === BATCH_SIZE) {
    targetColl.insertMany(batch, { ordered: false });
    copied += batch.length;
    batch = [];
  }
}

if (batch.length > 0) {
  targetColl.insertMany(batch, { ordered: false });
  copied += batch.length;
}

print("Transfer complete. Copied " + copied + " documents.");
`;
}
