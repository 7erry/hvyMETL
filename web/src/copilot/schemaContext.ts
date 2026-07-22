import type { MigrationPlan } from '../migrationPlanTypes';
import type { CardinalityOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';
import type { GuardrailIssue } from './types';

export type CopilotSchemaContextPayload = {
  tables: { name: string; columnCount: number; rowCount?: number }[];
  relationships: {
    childTable: string;
    parentTable: string;
    isBounded: boolean;
    maxChildrenPerParent?: number;
  }[];
  guardrailIssues: {
    tableName: string;
    label: string;
    detail: string;
    severity: string;
  }[];
  cardinalityOverrides: Record<string, number>;
  forceEmbedOverrides: Record<string, boolean>;
  collections?: { name: string; sourceTable: string }[];
};

/** Builds the schema context payload sent to /api/copilot/chat. */
export function buildSchemaContextPayload(input: {
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  cardinalityOverrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  guardrailIssues: GuardrailIssue[];
}): CopilotSchemaContextPayload {
  const { model, plan, cardinalityOverrides, forceEmbedOverrides, guardrailIssues } = input;

  return {
    tables: (model?.tables ?? []).map((table) => ({
      name: table.name,
      columnCount: table.columns.length,
      rowCount: table.rowCount || undefined,
    })),
    relationships: (model?.relationships ?? []).map((rel) => ({
      childTable: rel.childTable,
      parentTable: rel.parentTable,
      isBounded: rel.isBounded,
      maxChildrenPerParent: rel.maxChildrenPerParent || undefined,
    })),
    guardrailIssues: guardrailIssues.map((issue) => ({
      tableName: issue.tableName,
      label: issue.label,
      detail: issue.detail,
      severity: issue.severity,
    })),
    cardinalityOverrides,
    forceEmbedOverrides,
    collections: plan?.collections.map((c) => ({ name: c.name, sourceTable: c.sourceTable })),
  };
}
