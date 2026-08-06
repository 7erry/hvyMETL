import type { CopilotSearchFieldHint } from '../../../src/copilot/groveChat.ts';
import type { MigrationPlan } from '../migrationPlanTypes';
import { fieldsForCollection } from '../migrationPlanDisplay';
import {
  recommendSearchForCollectionFields,
  searchRecommendationKindLabel,
} from '../../../src/copilot/architectureReviewSearchRecommendations.ts';

export type { CopilotSearchFieldHint };

/** Builds search index hints from migration plan collection schemas for the copilot system prompt. */
export function buildSearchFieldHintsFromPlan(plan: MigrationPlan | null): CopilotSearchFieldHint[] | undefined {
  if (!plan?.collections.length) return undefined;

  const hints: CopilotSearchFieldHint[] = [];
  for (const collection of plan.collections) {
    const stringFields = fieldsForCollection(collection)
      .filter((row) => row.bsonType === 'string' || row.bsonType.includes('string'))
      .map((row) => row.name);
    const recs = recommendSearchForCollectionFields(collection.name, stringFields);
    for (const rec of recs) {
      hints.push({
        collection: rec.collection,
        field: rec.field,
        kind: searchRecommendationKindLabel(rec.kind),
        summary: rec.summary,
      });
    }
  }

  return hints.length > 0 ? hints : undefined;
}
