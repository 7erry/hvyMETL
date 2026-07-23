/** Plan snapshot sent with Mongo analyze compare requests. */
export type MongoPlanContextPayload = {
  profileId?: string;
  collections: Array<{
    name: string;
    sourceTable: string;
    topLevelFields: string[];
    embeddedFields: string[];
    indexKeys: string[];
  }>;
};

/** Build the migration-plan snapshot for server-side Atlas comparison tools. */
export function buildMongoPlanContext(plan: MigrationPlan | null): MongoPlanContextPayload | undefined {
  if (!plan?.collections.length) return undefined;

  return {
    profileId: plan.profileId,
    collections: plan.collections.map((collection) => ({
      name: collection.name,
      sourceTable: collection.sourceTable,
      topLevelFields: Object.keys(
        (collection.jsonSchema.properties as Record<string, unknown> | undefined) ?? {},
      ).sort(),
      embeddedFields: collection.embeddedArrays.map((entry) => entry.field).sort(),
      indexKeys: collection.indexes
        .map((index) =>
          Object.entries(index.keys)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([field, direction]) => `${field}:${direction}`)
            .join(','),
        )
        .filter(Boolean)
        .sort(),
    })),
  };
}
