import type { MigrationPlan } from '../migrationPlanTypes';
import type { CardinalityOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import { applyCardinalityOverrides } from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';
import type { GuardrailIssue } from './types';
import type { CopilotDatasetScaleContext } from '../../../src/copilot/copilotDatasetScale.ts';
import type { CopilotVectorSearchIndexRecord } from '../../../src/copilot/copilotVectorSearchContext.ts';
import type { CopilotAtlasSearchIndexRecord } from '../../../src/copilot/copilotAtlasSearchContext.ts';
import type { ManagerCostInputs } from '../managerCostEstimate';
import { buildDatasetScaleContext } from './buildDatasetScaleContext';
import { buildSearchFieldHintsFromPlan } from './buildSearchFieldHints';
import type { CopilotRelationshipCardinality } from '../../../src/copilot/formatRelationshipCardinality.ts';

export type CopilotSchemaContextPayload = {
  tables: { name: string; columnCount: number; rowCount?: number }[];
  relationships: CopilotRelationshipCardinality[];
  guardrailIssues: {
    tableName: string;
    label: string;
    detail: string;
    severity: string;
  }[];
  cardinalityOverrides: Record<string, number>;
  forceEmbedOverrides: Record<string, boolean>;
  collections?: { name: string; sourceTable: string }[];
  datasetScale?: CopilotDatasetScaleContext;
  targetDatabase?: string;
  vectorSearchIndexes?: CopilotVectorSearchIndexRecord[];
  atlasSearchIndexes?: CopilotAtlasSearchIndexRecord[];
  searchFieldHints?: import('../../../src/copilot/groveChat.ts').CopilotSearchFieldHint[];
};

function mapRelationshipForCopilot(
  relationship: SqlStructuralModel['relationships'][number],
): CopilotRelationshipCardinality {
  const source = relationship.cardinalitySource ?? 'unknown';

  return {
    childTable: relationship.childTable,
    parentTable: relationship.parentTable,
    fkColumn: relationship.fkColumn,
    isBounded: relationship.isBounded,
    minChildrenPerParent: relationship.minChildrenPerParent,
    avgChildrenPerParent: relationship.avgChildrenPerParent || undefined,
    p95ChildrenPerParent: relationship.p95ChildrenPerParent,
    p99ChildrenPerParent: relationship.p99ChildrenPerParent,
    maxChildrenPerParent: relationship.maxChildrenPerParent || undefined,
    cardinalitySource: source,
  };
}

/** Builds the schema context payload sent to /api/copilot/chat. */
export function buildSchemaContextPayload(input: {
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  cardinalityOverrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  guardrailIssues: GuardrailIssue[];
  managerCostInputs?: ManagerCostInputs;
  targetDatabase?: string;
  vectorSearchIndexes?: CopilotVectorSearchIndexRecord[];
  atlasSearchIndexes?: CopilotAtlasSearchIndexRecord[];
}): CopilotSchemaContextPayload {
  const {
    model,
    plan,
    cardinalityOverrides,
    forceEmbedOverrides,
    guardrailIssues,
    managerCostInputs,
    targetDatabase,
    vectorSearchIndexes,
    atlasSearchIndexes,
  } = input;

  const effectiveModel = model
    ? applyCardinalityOverrides(model, cardinalityOverrides, forceEmbedOverrides)
    : null;

  return {
    tables: (effectiveModel?.tables ?? []).map((table) => ({
      name: table.name,
      columnCount: table.columns.length,
      rowCount: table.rowCount || undefined,
    })),
    relationships: (effectiveModel?.relationships ?? []).map((relationship) =>
      mapRelationshipForCopilot(relationship),
    ),
    guardrailIssues: guardrailIssues.map((issue) => ({
      tableName: issue.tableName,
      label: issue.label,
      detail: issue.detail,
      severity: issue.severity,
    })),
    cardinalityOverrides,
    forceEmbedOverrides,
    collections: plan?.collections.map((c) => ({ name: c.name, sourceTable: c.sourceTable })),
    datasetScale: managerCostInputs ? buildDatasetScaleContext(model, plan, managerCostInputs) : undefined,
    targetDatabase: targetDatabase?.trim() || undefined,
    vectorSearchIndexes: vectorSearchIndexes?.length ? vectorSearchIndexes : undefined,
    atlasSearchIndexes: atlasSearchIndexes?.length ? atlasSearchIndexes : undefined,
    searchFieldHints: buildSearchFieldHintsFromPlan(plan),
  };
}
