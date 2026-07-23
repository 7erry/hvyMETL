/**
 * Migration-plan snapshot passed from the copilot UI for Atlas comparison tools.
 */

export type MongoPlanContextCollection = {
  name: string;
  sourceTable: string;
  topLevelFields: string[];
  embeddedFields: string[];
  indexKeys: string[];
};

export type MongoPlanContext = {
  profileId?: string;
  collections: MongoPlanContextCollection[];
};

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((entry) => String(entry).trim()).filter(Boolean))].sort();
}

/** Parse optional plan context from the inspect API request body. */
export function parseMongoPlanContext(raw: unknown): MongoPlanContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.collections)) return undefined;

  const collections = body.collections
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      name: String(entry.name ?? '').trim(),
      sourceTable: String(entry.sourceTable ?? '').trim(),
      topLevelFields: normalizeStringList(entry.topLevelFields),
      embeddedFields: normalizeStringList(entry.embeddedFields),
      indexKeys: normalizeStringList(entry.indexKeys),
    }))
    .filter((entry) => entry.name.length > 0);

  if (collections.length === 0) return undefined;

  return {
    profileId: typeof body.profileId === 'string' ? body.profileId : undefined,
    collections,
  };
}

/** Locate the planned collection that matches a live Atlas collection name. */
export function findPlanCollection(
  planContext: MongoPlanContext | undefined,
  collectionName: string,
): MongoPlanContextCollection | undefined {
  if (!planContext) return undefined;
  const normalized = collectionName.trim().toLowerCase();
  return planContext.collections.find(
    (entry) =>
      entry.name.toLowerCase() === normalized || entry.sourceTable.toLowerCase() === normalized,
  );
}
