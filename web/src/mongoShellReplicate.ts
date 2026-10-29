/** Build a mongosh script that copies one collection between two deployments. */

export const MONGO_SHELL_REPLICATE_TIMEOUT_MS = 15 * 60 * 1000;

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
