import { MongoClient } from 'mongodb';
import { modelFromMongoCollections } from './mongoJsonParser.js';
import type { SqlStructuralModel } from '../types.js';

/** Documents read per collection. shortcut: a sample is not the whole collection, upgrade when the pipeline reads live. */
export const LIVE_MONGO_SAMPLE_LIMIT = 50;

export function assertLiveMongoUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
    throw new Error('Live import needs a mongodb:// or mongodb+srv:// URI.');
  }
  return trimmed;
}

/** Database from the form, or the path of the URI. */
export function mongoDatabaseName(uri: string, explicit?: string): string {
  const named = explicit?.trim();
  if (named) return named;
  let pathname = '';
  try {
    pathname = new URL(uri).pathname.replace(/^\//, '');
  } catch {
    throw new Error('MongoDB URI is not valid.');
  }
  const database = decodeURIComponent(pathname.split('?')[0] ?? '');
  if (!database) throw new Error('Database name is required.');
  return database;
}

export function publicMongoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/mongodb(?:\+srv)?:\/\/\S/i.test(message)) return 'Could not connect to MongoDB.';
  if (/(?:postgres(?:ql)?|mysql):\/\/\S/i.test(message)) return 'Could not connect to the database.';
  return message;
}

/** Sample each user collection and infer the same structural model as a MongoDB JSON paste. */
export async function importLiveMongoDatabase(
  uri: string,
  database: string,
  sampleLimit = LIVE_MONGO_SAMPLE_LIMIT,
): Promise<SqlStructuralModel> {
  const client = new MongoClient(assertLiveMongoUri(uri), { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const db = client.db(database);
    const listed = await db.listCollections({}, { nameOnly: true }).toArray();
    const collections: { name: string; documents: Record<string, unknown>[] }[] = [];
    for (const entry of listed) {
      const name = entry.name;
      if (!name || name.startsWith('system.')) continue;
      const documents = await db.collection(name).find({}).limit(sampleLimit).toArray();
      if (documents.length === 0) continue;
      collections.push({ name, documents });
    }
    return modelFromMongoCollections(collections, 'ddl:mongodb-json');
  } finally {
    await client.close();
  }
}
