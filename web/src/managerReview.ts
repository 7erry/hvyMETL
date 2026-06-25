import type { CollectionPlan, MigrationPlan, PatternId } from './migrationPlanTypes';
import type { TransformationSummary } from './transformationSummaryTypes';

export type ReviewRecommendation = {
  id: string;
  category: 'pattern' | 'structure' | 'note';
  title: string;
  detail: string;
};

export type CollectionReviewItem = {
  collectionName: string;
  sourceTable: string;
  domainKey: string;
  recommendations: ReviewRecommendation[];
  accepted: boolean;
};

export type ManagerReviewAcceptances = {
  planGeneratedAt: string;
  acceptedCollectionNames: string[];
};

const COMPLEX_PATTERNS = new Set<PatternId>([
  'embed',
  'bucket',
  'subset',
  'archive',
  'extended-reference',
  'polymorphic',
  'tree',
]);

const PATTERN_LABELS: Record<PatternId, string> = {
  embed: 'Embedded document',
  reference: 'Document reference',
  bucket: 'Time-series bucket',
  outlier: 'Outlier separation',
  'extended-reference': 'Extended reference',
  computed: 'Computed field',
  subset: 'Subset embed',
  attribute: 'Attribute pattern',
  polymorphic: 'Polymorphic reference',
  tree: 'Tree hierarchy',
  'schema-versioning': 'Schema versioning',
  'pre-allocation': 'Pre-allocation',
  'single-collection': 'Single collection',
  archive: 'Archive pattern',
};

function patternLabel(id: PatternId): string {
  return PATTERN_LABELS[id] ?? id;
}

/** Whether a collection has design flags that warrant manager sign-off (ignores acceptances). */
export function collectionHasReviewFlags(
  collection: CollectionPlan,
  summary?: TransformationSummary,
): boolean {
  const patternIds = collection.patterns.map((p) => p.pattern);
  if (patternIds.some((id) => COMPLEX_PATTERNS.has(id))) return true;
  if (collection.embeddedArrays.length > 0 || collection.extendedReferences.length > 0) return true;
  if (collection.mergedTables.length > 1) return true;
  if (collection.archive) return true;
  const note = summary?.collections.find((c) => c.name === collection.name);
  if (note && note.notes.length > 0) return true;
  return false;
}

export function isReviewAccepted(
  collectionName: string,
  acceptances: ManagerReviewAcceptances | null,
  planGeneratedAt: string | undefined,
): boolean {
  if (!acceptances || !planGeneratedAt) return false;
  if (acceptances.planGeneratedAt !== planGeneratedAt) return false;
  return acceptances.acceptedCollectionNames.includes(collectionName);
}

/** Collection whose review acceptance covers a source SQL table in the before view. */
export function reviewCollectionForTable(
  tableName: string,
  plan: MigrationPlan,
): CollectionPlan | undefined {
  const foldedInto = plan.collections.find(
    (c) => c.mergedTables.includes(tableName) && c.sourceTable !== tableName,
  );
  if (foldedInto) return foldedInto;

  const asCollection = plan.collections.find((c) => c.name === tableName);
  if (asCollection) return asCollection;

  return plan.collections.find((c) => c.sourceTable === tableName);
}

export function isTableReviewAccepted(
  tableName: string,
  plan: MigrationPlan,
  acceptances?: ManagerReviewAcceptances | null,
): boolean {
  const collection = reviewCollectionForTable(tableName, plan);
  if (!collection) return false;
  return isReviewAccepted(collection.name, acceptances ?? null, plan.generatedAt);
}

export function collectionRequiresReview(
  collection: CollectionPlan,
  summary?: TransformationSummary,
  acceptances?: ManagerReviewAcceptances | null,
  planGeneratedAt?: string,
): boolean {
  if (isReviewAccepted(collection.name, acceptances ?? null, planGeneratedAt)) return false;
  return collectionHasReviewFlags(collection, summary);
}

export function buildRecommendationsForCollection(
  collection: CollectionPlan,
  summary?: TransformationSummary,
): ReviewRecommendation[] {
  const items: ReviewRecommendation[] = [];

  for (const pattern of collection.patterns) {
    if (!COMPLEX_PATTERNS.has(pattern.pattern)) continue;
    items.push({
      id: `pattern-${pattern.pattern}-${pattern.target}`,
      category: 'pattern',
      title: patternLabel(pattern.pattern),
      detail: pattern.reason,
    });
  }

  if (collection.mergedTables.length > 1) {
    const folded = collection.mergedTables.filter((t) => t !== collection.sourceTable);
    items.push({
      id: 'merged-tables',
      category: 'structure',
      title: 'Table folding',
      detail:
        folded.length > 0
          ? `Fold ${folded.join(', ')} into collection "${collection.name}" (source: ${collection.sourceTable}).`
          : `Merge ${collection.mergedTables.length} source tables into one collection.`,
    });
  }

  for (const embed of collection.embeddedArrays) {
    items.push({
      id: `embed-${embed.field}`,
      category: 'structure',
      title: `Embed ${embed.sourceTable}`,
      detail: `Store rows from ${embed.sourceTable} in embedded array "${embed.field}" (join on ${embed.joinColumn}).${
        embed.subsetLimit ? ` Subset limit: ${embed.subsetLimit} rows.` : ''
      }${embed.overflowCollection ? ` Overflow collection: ${embed.overflowCollection}.` : ''}`,
    });
  }

  for (const ext of collection.extendedReferences) {
    items.push({
      id: `ext-ref-${ext.field}`,
      category: 'structure',
      title: `Extended reference: ${ext.field}`,
      detail: `Denormalize ${ext.lookupColumns.join(', ')} from ${ext.sourceTable} via ${ext.viaColumn}.`,
    });
  }

  if (collection.archive) {
    items.push({
      id: 'archive',
      category: 'structure',
      title: 'Archive policy',
      detail: `Archive documents older than ${collection.archive.archiveAfterDays} days (column ${collection.archive.timeColumn}) to "${collection.archive.archiveCollection}".`,
    });
  }

  if (collection.bucket) {
    items.push({
      id: 'bucket',
      category: 'structure',
      title: 'Time-series bucket',
      detail: `Group by ${collection.bucket.groupByColumn} with ${collection.bucket.windowMinutes}-minute windows on ${collection.bucket.timeColumn}.`,
    });
  }

  const note = summary?.collections.find((c) => c.name === collection.name);
  if (note) {
    for (let i = 0; i < note.notes.length; i += 1) {
      items.push({
        id: `note-${i}`,
        category: 'note',
        title: 'Design note',
        detail: note.notes[i],
      });
    }
  }

  return items;
}

export function buildCollectionReviewItems(
  plan: MigrationPlan | null,
  summary?: TransformationSummary,
  acceptances?: ManagerReviewAcceptances | null,
): CollectionReviewItem[] {
  if (!plan) return [];

  return plan.collections
    .filter((collection) => collectionHasReviewFlags(collection, summary))
    .map((collection) => ({
      collectionName: collection.name,
      sourceTable: collection.sourceTable,
      domainKey: collection.sourceTable || collection.name,
      recommendations: buildRecommendationsForCollection(collection, summary),
      accepted: isReviewAccepted(collection.name, acceptances ?? null, plan.generatedAt),
    }))
    .sort((a, b) => a.collectionName.localeCompare(b.collectionName));
}

export function acceptCollectionReview(
  acceptances: ManagerReviewAcceptances | null,
  planGeneratedAt: string,
  collectionName: string,
): ManagerReviewAcceptances {
  const base =
    acceptances?.planGeneratedAt === planGeneratedAt
      ? acceptances.acceptedCollectionNames
      : [];
  if (base.includes(collectionName)) {
    return { planGeneratedAt, acceptedCollectionNames: base };
  }
  return {
    planGeneratedAt,
    acceptedCollectionNames: [...base, collectionName].sort(),
  };
}

export function acceptAllCollectionReviews(
  acceptances: ManagerReviewAcceptances | null,
  planGeneratedAt: string,
  collectionNames: string[],
): ManagerReviewAcceptances {
  const base =
    acceptances?.planGeneratedAt === planGeneratedAt
      ? new Set(acceptances.acceptedCollectionNames)
      : new Set<string>();
  for (const name of collectionNames) base.add(name);
  return {
    planGeneratedAt,
    acceptedCollectionNames: [...base].sort(),
  };
}
