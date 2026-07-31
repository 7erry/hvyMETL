/**
 * Creates Atlas Vector Search autoEmbed indexes via the MongoDB driver (full field options).
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
import { isMongoMcpEnabled, MCP_INSPECT_UNAVAILABLE_MESSAGE } from './mongoMcpClient.js';
import {
  buildAutoEmbedVectorSearchIndexDefinition,
  defaultAutoEmbedVectorIndexName,
  parseMongoAutoEmbedVectorIndexInput,
  type MongoAutoEmbedVectorIndexInput,
} from './mongoVectorAutoEmbedIndex.js';

export type MongoAutoEmbedVectorIndexResult = {
  ok: boolean;
  summary: string;
  error?: string;
  serviceUnavailable?: boolean;
  database?: string;
  collection?: string;
  indexName?: string;
  definition?: ReturnType<typeof buildAutoEmbedVectorSearchIndexDefinition>;
};

async function resolvePhysicalDatabaseForLogical(
  client: MongoClient,
  scope: Awaited<ReturnType<typeof resolveTenantMongoInspectScope>>,
  logicalDatabase: string,
): Promise<string> {
  const admin = client.db().admin();
  const listing = await admin.listDatabases();
  const clusterNames = (listing.databases ?? []).map((entry) => entry.name);
  const matched = scope.findPhysicalDatabaseForLogical(logicalDatabase, clusterNames);
  if (matched) {
    return matched;
  }
  const physical = scope.resolvePhysicalDatabase(logicalDatabase);
  if (!scope.authEnabled || scope.ownsPhysicalDatabase(physical)) {
    return physical;
  }
  throw new Error(`Database "${logicalDatabase}" was not found on this cluster.`);
}

/** Create a vectorSearch index with one autoEmbed field on the tenant's Atlas collection. */
export async function createMongoAutoEmbedVectorIndex(
  req: Request,
  rawBody: unknown,
): Promise<MongoAutoEmbedVectorIndexResult> {
  if (!isMongoMcpEnabled()) {
    return {
      ok: false,
      summary: MCP_INSPECT_UNAVAILABLE_MESSAGE,
      error: MCP_INSPECT_UNAVAILABLE_MESSAGE,
      serviceUnavailable: true,
    };
  }

  let input: MongoAutoEmbedVectorIndexInput;
  try {
    input = parseMongoAutoEmbedVectorIndexInput(rawBody);
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

  const logicalDatabase = scope.resolveLogicalDatabase(input.database);
  const definition = buildAutoEmbedVectorSearchIndexDefinition(input);
  const indexName = input.name ?? defaultAutoEmbedVectorIndexName(input);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const physicalDatabase = await resolvePhysicalDatabaseForLogical(client, scope, logicalDatabase);
    if (scope.authEnabled && !scope.ownsPhysicalDatabase(physicalDatabase)) {
      throw new Error('You do not have access to that database.');
    }

    const collection = client.db(physicalDatabase).collection(input.collection);
    const createdName = await collection.createSearchIndex({
      name: indexName,
      type: 'vectorSearch',
      definition,
    });

    return {
      ok: true,
      summary: `Created autoEmbed vector index "${createdName}" on ${logicalDatabase}.${input.collection} (field ${input.path}).`,
      database: logicalDatabase,
      collection: input.collection,
      indexName: createdName,
      definition,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary: message, error: message };
  } finally {
    await client.close().catch(() => undefined);
  }
}
