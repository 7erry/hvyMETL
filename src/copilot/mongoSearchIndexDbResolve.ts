/**
 * Resolves logical vs physical database names when creating Atlas Search indexes via the driver.
 */

import type { MongoClient } from 'mongodb';
import type { resolveTenantMongoInspectScope } from './mongoInspectScope.js';

type InspectScope = Awaited<ReturnType<typeof resolveTenantMongoInspectScope>>;

/** Resolve logical database when only collection name is provided. */
export async function resolveLogicalDatabaseForSearchIndex(
  client: MongoClient,
  scope: InspectScope,
  collectionName: string,
  databaseArg?: string,
): Promise<string> {
  if (databaseArg?.trim()) {
    return scope.resolveLogicalDatabase(databaseArg.trim());
  }

  const admin = client.db().admin();
  const listing = await admin.listDatabases();
  const clusterNames = (listing.databases ?? []).map((entry) => entry.name);
  const logicalMatches = new Set<string>();

  for (const physicalDatabase of clusterNames) {
    if (scope.authEnabled && !scope.ownsPhysicalDatabase(physicalDatabase)) continue;
    const collections = await client
      .db(physicalDatabase)
      .listCollections({ name: collectionName }, { nameOnly: true })
      .toArray();
    if (collections.some((entry) => entry.name === collectionName)) {
      logicalMatches.add(scope.toLogicalDatabase(physicalDatabase));
    }
  }

  const matches = [...logicalMatches];
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length === 0) {
    throw new Error(
      `Collection "${collectionName}" was not found in any of your databases. Run listMongoCollections first.`,
    );
  }
  throw new Error(
    `Collection "${collectionName}" exists in multiple databases (${matches.join(', ')}). Specify the database argument.`,
  );
}

/** Map a logical database name to the physical name on the cluster. */
export async function resolvePhysicalDatabaseForLogical(
  client: MongoClient,
  scope: InspectScope,
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
