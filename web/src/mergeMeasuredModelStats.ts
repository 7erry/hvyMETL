import type { RelationshipModel, SqlStructuralModel } from './types';
import { relationshipOverrideKey } from './cardinalityOverrides';

/** Merge CSV/SQLite row counts and relationship stats into the session model (preserves canvas edits). */
export function mergeMeasuredModelStats(
  base: SqlStructuralModel,
  measured: SqlStructuralModel,
): SqlStructuralModel {
  const measuredTables = new Map(measured.tables.map((table) => [table.name, table]));
  const measuredRelationships = new Map(
    measured.relationships.map((relationship) => [relationshipOverrideKey(relationship), relationship]),
  );

  return {
    ...base,
    tables: base.tables.map((table) => {
      const stats = measuredTables.get(table.name);
      if (!stats || stats.rowCount <= 0) return table;
      return { ...table, rowCount: stats.rowCount };
    }),
    relationships: base.relationships.map((relationship) => {
      const stats = measuredRelationships.get(relationshipOverrideKey(relationship));
      if (!stats || stats.maxChildrenPerParent <= 0) return relationship;
      if (stats.cardinalitySource !== 'csv' && stats.cardinalitySource !== 'database') return relationship;
      return mergeRelationshipStats(relationship, stats);
    }),
  };
}

function mergeRelationshipStats(
  relationship: RelationshipModel,
  stats: RelationshipModel,
): RelationshipModel {
  return {
    ...relationship,
    minChildrenPerParent: stats.minChildrenPerParent,
    avgChildrenPerParent: stats.avgChildrenPerParent,
    p95ChildrenPerParent: stats.p95ChildrenPerParent,
    p99ChildrenPerParent: stats.p99ChildrenPerParent,
    maxChildrenPerParent: stats.maxChildrenPerParent,
    isBounded: stats.isBounded,
    cardinalitySource: stats.cardinalitySource,
  };
}
