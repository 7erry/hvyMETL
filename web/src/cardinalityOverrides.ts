import type { RelationshipModel, SqlStructuralModel } from './types';

export type CardinalityOverrides = Record<string, number>;

const SAFE_EMBED_MAX_CHILDREN = 5000;

export function relationshipOverrideKey(relationship: RelationshipModel): string {
  return `${relationship.parentTable}::${relationship.childTable}::${relationship.fkColumn}`;
}

export function relationshipLabel(relationship: RelationshipModel): string {
  return `${relationship.parentTable} -> ${relationship.childTable} (${relationship.fkColumn})`;
}

function avgFromMax(maxChildrenPerParent: number): number {
  return Math.max(1, Math.ceil(maxChildrenPerParent / 2));
}

export function applyCardinalityOverrides(
  model: SqlStructuralModel,
  overrides: CardinalityOverrides,
): SqlStructuralModel {
  const relationships = model.relationships.map((relationship) => {
    const maxChildrenPerParent = overrides[relationshipOverrideKey(relationship)];
    if (!Number.isFinite(maxChildrenPerParent) || maxChildrenPerParent <= 0) return relationship;

    return {
      ...relationship,
      avgChildrenPerParent: avgFromMax(maxChildrenPerParent),
      maxChildrenPerParent,
      isBounded: maxChildrenPerParent <= SAFE_EMBED_MAX_CHILDREN,
      cardinalitySource: 'developer' as const,
    };
  });

  return { ...model, relationships };
}

export function pruneCardinalityOverrides(
  model: SqlStructuralModel | null,
  overrides: CardinalityOverrides,
): CardinalityOverrides {
  if (!model) return {};
  const validKeys = new Set(model.relationships.map(relationshipOverrideKey));
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => validKeys.has(key)));
}
