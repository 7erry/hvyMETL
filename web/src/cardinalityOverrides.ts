import type { RelationshipModel, SqlStructuralModel } from './types';

export type CardinalityOverrides = Record<string, number>;
export type ForceEmbedOverrides = Record<string, boolean>;

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
  forceEmbedOverrides: ForceEmbedOverrides = {},
): SqlStructuralModel {
  const relationships = model.relationships.map((relationship) => {
    const maxChildrenPerParent = overrides[relationshipOverrideKey(relationship)];
    const hasMaxOverride =
      typeof maxChildrenPerParent === 'number' && Number.isFinite(maxChildrenPerParent) && maxChildrenPerParent > 0;
    const forceEmbed = forceEmbedOverrides[relationshipOverrideKey(relationship)] === true;
    if (!forceEmbed && !hasMaxOverride) return relationship;

    return {
      ...relationship,
      ...(hasMaxOverride
        ? {
            avgChildrenPerParent: avgFromMax(maxChildrenPerParent),
            maxChildrenPerParent,
            isBounded: maxChildrenPerParent <= SAFE_EMBED_MAX_CHILDREN,
            cardinalitySource: 'developer' as const,
          }
        : {}),
      forceEmbed,
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

export function pruneForceEmbedOverrides(
  model: SqlStructuralModel | null,
  overrides: ForceEmbedOverrides,
): ForceEmbedOverrides {
  if (!model) return {};
  const validKeys = new Set(model.relationships.map(relationshipOverrideKey));
  return Object.fromEntries(Object.entries(overrides).filter(([key, value]) => value === true && validKeys.has(key)));
}
