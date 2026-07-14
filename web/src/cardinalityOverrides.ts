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

/** True when every relationship in the model has force embed enabled. */
export function allRelationshipsForceEmbed(
  model: SqlStructuralModel,
  overrides: ForceEmbedOverrides,
): boolean {
  if (model.relationships.length === 0) return false;
  return model.relationships.every(
    (relationship) => overrides[relationshipOverrideKey(relationship)] === true,
  );
}

/** True when at least one relationship has force embed enabled but not all. */
export function someRelationshipsForceEmbed(
  model: SqlStructuralModel,
  overrides: ForceEmbedOverrides,
): boolean {
  const forced = model.relationships.filter(
    (relationship) => overrides[relationshipOverrideKey(relationship)] === true,
  ).length;
  return forced > 0 && forced < model.relationships.length;
}

/** Build force-embed overrides for every relationship, or clear all when disabled. */
export function buildForceEmbedOverridesForAll(
  model: SqlStructuralModel,
  enabled: boolean,
): ForceEmbedOverrides {
  if (!enabled) return {};
  return Object.fromEntries(
    model.relationships.map((relationship) => [relationshipOverrideKey(relationship), true]),
  );
}
