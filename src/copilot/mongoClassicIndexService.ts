/**
 * Creates classic MongoDB B-tree indexes via the MongoDB driver.
 */

import { MongoClient } from 'mongodb';
import type { Request } from 'express';
import { isAuthConfigured } from '../server/auth.js';
import { isHostedStudioRequest } from '../server/hosted.js';
import {
  MONGO_INSPECT_URI_MISSING_MESSAGE,
  resolveMongoInspectMongoUri,
} from './mongoInspectConnection.js';
import { resolveTenantMongoInspectScope } from './mongoInspectScope.js';
import {
  defaultClassicIndexName,
  parseMongoClassicIndexInput,
  type MongoClassicIndexInput,
  type MongoClassicIndexKeys,
} from './mongoClassicIndex.js';
import {
  resolveLogicalDatabaseForSearchIndex,
  resolvePhysicalDatabaseForLogical,
} from './mongoSearchIndexDbResolve.js';

export type MongoClassicIndexResult = {
  ok: boolean;
  summary: string;
  error?: string;
  serviceUnavailable?: boolean;
  database?: string;
  collection?: string;
  indexName?: string;
  keys?: MongoClassicIndexKeys;
};

/** Create a classic ascending/descending/text index on the tenant's Atlas collection. */
export async function createMongoClassicIndex(
  req: Request,
  rawBody: unknown,
): Promise<MongoClassicIndexResult> {
  let input: MongoClassicIndexInput;
  try {
    input = parseMongoClassicIndexInput(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary: message, error: message };
  }

  const hosted = isHostedStudioRequest(req);
  const authEnabled = isAuthConfigured();
  const mongoUri = resolveMongoInspectMongoUri(req);
  if (!mongoUri) {
    if (hosted && authEnabled) {
      return {
        ok: false,
        summary: MONGO_INSPECT_URI_MISSING_MESSAGE,
        error: MONGO_INSPECT_URI_MISSING_MESSAGE,
      };
    }
    return {
      ok: false,
      summary: 'MongoDB connection string is not configured. Add it under Pipeline settings.',
      error: 'MongoDB connection string is not configured.',
    };
  }

  let scope: Awaited<ReturnType<typeof resolveTenantMongoInspectScope>>;
  try {
    scope = await resolveTenantMongoInspectScope(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary: message, error: message };
  }

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const logicalDatabase = await resolveLogicalDatabaseForSearchIndex(
      client,
      scope,
      input.collection,
      input.database,
    );
    const physicalDatabase = await resolvePhysicalDatabaseForLogical(client, scope, logicalDatabase);
    if (scope.authEnabled && !scope.ownsPhysicalDatabase(physicalDatabase)) {
      throw new Error('You do not have access to that database.');
    }

    const indexName = input.options?.name ?? defaultClassicIndexName(input.keys);
    const collection = client.db(physicalDatabase).collection(input.collection);
    const createdName = await collection.createIndex(input.keys, {
      ...input.options,
      name: indexName,
    });

    const keySummary = Object.entries(input.keys)
      .map(([field, direction]) => `${field}: ${direction}`)
      .join(', ');

    return {
      ok: true,
      summary: `Created classic index "${createdName}" on ${logicalDatabase}.${input.collection} ({ ${keySummary} }).`,
      database: logicalDatabase,
      collection: input.collection,
      indexName: createdName,
      keys: input.keys,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary: message, error: message };
  } finally {
    await client.close().catch(() => undefined);
  }
}
