import type { RelationshipModel, SqlStructuralModel } from './types';
import {
  estimateRelationshipCardinalityFromMax,
  relationshipOverrideKey as sharedRelationshipOverrideKey,
} from '../../src/utilities/relationshipCardinalityStats.ts';

export type CardinalityOverrides = Record<string, number>;
export type ForceEmbedOverrides = Record<string, boolean>;
/** When true, force-embed puts the parent table inside the child collection (reversed FK direction). */
export type EmbedDirectionOverrides = Record<string, boolean>;

export function relationshipOverrideKey(relationship: RelationshipModel): string {
  return sharedRelationshipOverrideKey(relationship);
}

export function relationshipLabel(relationship: RelationshipModel): string {
  return `${relationship.parentTable} -> ${relationship.childTable} (${relationship.fkColumn})`;
}

/** Embed-direction label: arrow points at the collection that receives the embed. */
export function relationshipEmbedDirectionLabel(
  relationship: RelationshipModel,
  reversed: boolean,
): { left: string; arrow: '→' | '←'; right: string; hostTable: string; guestTable: string } {
  if (reversed) {
    return {
      left: relationship.parentTable,
      arrow: '→',
      right: relationship.childTable,
      hostTable: relationship.childTable,
      guestTable: relationship.parentTable,
    };
  }
  return {
    left: relationship.childTable,
    arrow: '→',
    right: relationship.parentTable,
    hostTable: relationship.parentTable,
    guestTable: relationship.childTable,
  };
}

export function applyCardinalityOverrides(
  model: SqlStructuralModel,
  overrides: CardinalityOverrides,
  forceEmbedOverrides: ForceEmbedOverrides = {},
  embedDirectionOverrides: EmbedDirectionOverrides = {},
): SqlStructuralModel {
  const relationships = model.relationships.map((relationship) => {
    const key = relationshipOverrideKey(relationship);
    const maxChildrenPerParent = overrides[key];
    const hasMaxOverride =
      typeof maxChildrenPerParent === 'number' && Number.isFinite(maxChildrenPerParent) && maxChildrenPerParent > 0;
    const forceEmbedOverride = forceEmbedOverrides[key];
    const hasForceEmbedOverride = forceEmbedOverride === true || forceEmbedOverride === false;
    const embedDirectionReversed = embedDirectionOverrides[key] === true;
    if (!hasForceEmbedOverride && !hasMaxOverride && !embedDirectionReversed) return relationship;

    return {
      ...relationship,
      ...(hasMaxOverride
        ? {
            ...estimateRelationshipCardinalityFromMax(maxChildrenPerParent),
            cardinalitySource: 'developer' as const,
          }
        : {}),
      ...(hasForceEmbedOverride ? { forceEmbed: forceEmbedOverride } : {}),
      ...(embedDirectionReversed ? { embedDirectionReversed: true } : {}),
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
  return Object.fromEntries(Object.entries(overrides).filter(([key, value]) => validKeys.has(key) && typeof value === 'boolean'));
}

export function pruneEmbedDirectionOverrides(
  model: SqlStructuralModel | null,
  overrides: EmbedDirectionOverrides,
): EmbedDirectionOverrides {
  if (!model) return {};
  const validKeys = new Set(model.relationships.map(relationshipOverrideKey));
  return Object.fromEntries(Object.entries(overrides).filter(([key, value]) => validKeys.has(key) && value === true));
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
