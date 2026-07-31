/**
 * Creates Atlas MongoDB Search (lexical) indexes via the MongoDB driver.
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
  buildAtlasSearchIndexDefinition,
  defaultAtlasSearchIndexName,
  parseMongoAtlasSearchIndexInput,
  type MongoAtlasSearchIndexInput,
} from './mongoAtlasSearchIndex.js';
import {
  resolveLogicalDatabaseForSearchIndex,
  resolvePhysicalDatabaseForLogical,
} from './mongoSearchIndexDbResolve.js';

export type MongoAtlasSearchIndexResult = {
  ok: boolean;
  summary: string;
  error?: string;
  serviceUnavailable?: boolean;
  database?: string;
  collection?: string;
  indexName?: string;
  pattern?: MongoAtlasSearchIndexInput['pattern'];
  definition?: ReturnType<typeof buildAtlasSearchIndexDefinition>;
};

/** Create a lexical MongoDB Search index (type search) on the tenant's Atlas collection. */
export async function createMongoAtlasSearchIndex(
  req: Request,
  rawBody: unknown,
): Promise<MongoAtlasSearchIndexResult> {
  let input: MongoAtlasSearchIndexInput;
  try {
    input = parseMongoAtlasSearchIndexInput(rawBody);
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
    const definition = buildAtlasSearchIndexDefinition(input);
    const indexName = input.name ?? defaultAtlasSearchIndexName(input);

    const physicalDatabase = await resolvePhysicalDatabaseForLogical(client, scope, logicalDatabase);
    if (scope.authEnabled && !scope.ownsPhysicalDatabase(physicalDatabase)) {
      throw new Error('You do not have access to that database.');
    }

    const collection = client.db(physicalDatabase).collection(input.collection);
    const createdName = await collection.createSearchIndex({
      name: indexName,
      type: 'search',
      definition,
    });

    return {
      ok: true,
      summary: `Created MongoDB Search (${input.pattern}) index "${createdName}" on ${logicalDatabase}.${input.collection}.`,
      database: logicalDatabase,
      collection: input.collection,
      indexName: createdName,
      pattern: input.pattern,
      definition,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary: message, error: message };
  } finally {
    await client.close().catch(() => undefined);
  }
}
