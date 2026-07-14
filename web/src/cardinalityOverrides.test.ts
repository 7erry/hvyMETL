import { describe, expect, it } from 'vitest';
import {
  applyCardinalityOverrides,
  allRelationshipsForceEmbed,
  buildForceEmbedOverridesForAll,
  pruneCardinalityOverrides,
  pruneForceEmbedOverrides,
  relationshipOverrideKey,
  someRelationshipsForceEmbed,
  type CardinalityOverrides,
  type ForceEmbedOverrides,
} from './cardinalityOverrides';
import type { SqlStructuralModel } from './types';

const model: SqlStructuralModel = {
  source: 'test',
  tables: [
    { name: 'parents', columns: [], primaryKey: ['id'], foreignKeys: [], rowCount: 0 },
    {
      name: 'children',
      columns: [],
      primaryKey: ['id'],
      foreignKeys: [{ column: 'parent_id', referencesTable: 'parents', referencesColumn: 'id' }],
      rowCount: 0,
    },
  ],
  relationships: [
    {
      parentTable: 'parents',
      childTable: 'children',
      fkColumn: 'parent_id',
      avgChildrenPerParent: 0,
      maxChildrenPerParent: 0,
      isBounded: false,
    },
  ],
};

describe('cardinalityOverrides', () => {
  it('applies a bounded developer max to a relationship', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const adjusted = applyCardinalityOverrides(model, { [key]: 12 });

    expect(adjusted.relationships[0]).toMatchObject({
      avgChildrenPerParent: 6,
      maxChildrenPerParent: 12,
      isBounded: true,
      cardinalitySource: 'developer',
    });
  });

  it('applies a force-embed developer override without cardinality stats', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const adjusted = applyCardinalityOverrides(model, {}, { [key]: true });

    expect(adjusted.relationships[0]).toMatchObject({
      maxChildrenPerParent: 0,
      isBounded: false,
      forceEmbed: true,
    });
  });

  it('treats developer max cardinality up to 5000 as bounded', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const adjusted = applyCardinalityOverrides(model, { [key]: 500 });

    expect(adjusted.relationships[0]).toMatchObject({
      avgChildrenPerParent: 250,
      maxChildrenPerParent: 500,
      isBounded: true,
      cardinalitySource: 'developer',
    });
  });

  it('keeps developer max cardinality above 5000 unbounded', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const adjusted = applyCardinalityOverrides(model, { [key]: 5001 });

    expect(adjusted.relationships[0]).toMatchObject({
      avgChildrenPerParent: 2501,
      maxChildrenPerParent: 5001,
      isBounded: false,
      cardinalitySource: 'developer',
    });
  });

  it('prunes stale relationship override keys', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const overrides: CardinalityOverrides = { [key]: 10, stale: 99 };

    expect(pruneCardinalityOverrides(model, overrides)).toEqual({ [key]: 10 });
  });

  it('prunes stale force-embed relationship override keys', () => {
    const key = relationshipOverrideKey(model.relationships[0]);
    const overrides: ForceEmbedOverrides = { [key]: true, stale: true, disabled: false };

    expect(pruneForceEmbedOverrides(model, overrides)).toEqual({ [key]: true });
  });

  it('buildForceEmbedOverridesForAll enables or clears every relationship', () => {
    const key = relationshipOverrideKey(model.relationships[0]);

    expect(buildForceEmbedOverridesForAll(model, true)).toEqual({ [key]: true });
    expect(buildForceEmbedOverridesForAll(model, false)).toEqual({});
  });

  it('allRelationshipsForceEmbed and someRelationshipsForceEmbed reflect override state', () => {
    const key = relationshipOverrideKey(model.relationships[0]);

    expect(allRelationshipsForceEmbed(model, {})).toBe(false);
    expect(someRelationshipsForceEmbed(model, {})).toBe(false);
    expect(allRelationshipsForceEmbed(model, { [key]: true })).toBe(true);
    expect(someRelationshipsForceEmbed(model, { [key]: true })).toBe(false);
  });
});
