/**
 * Children-per-parent distribution stats for FK relationships.
 * Used by CSV/SQLite enrichment, developer embed overrides, and Copilot Architecture Review.
 */

import { BOUNDED_CHILDREN_THRESHOLD, DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN } from '../design/embedThresholds.js';

/** Full distribution summary for one parent→child FK edge. */
export type RelationshipCardinalityStats = {
  minChildrenPerParent: number;
  avgChildrenPerParent: number;
  maxChildrenPerParent: number;
  p95ChildrenPerParent: number;
  p99ChildrenPerParent: number;
  isBounded: boolean;
};

const EMPTY_STATS: RelationshipCardinalityStats = {
  minChildrenPerParent: 0,
  avgChildrenPerParent: 0,
  maxChildrenPerParent: 0,
  p95ChildrenPerParent: 0,
  p99ChildrenPerParent: 0,
  isBounded: false,
};

/**
 * Linear-interpolation percentile on a sorted ascending array of per-parent child counts.
 *
 * @param sortedAsc - Non-empty counts sorted ascending.
 * @param p - Percentile 0–100 (e.g. 95, 99).
 */
export function percentileFromSorted(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  const weight = rank - lower;
  const value = sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
  return Math.round(value * 100) / 100;
}

/**
 * Compute min/avg/p95/p99/max from raw per-parent child counts (one count per parent key).
 */
export function computeRelationshipCardinalityStats(counts: number[]): RelationshipCardinalityStats {
  if (counts.length === 0) return { ...EMPTY_STATS };

  const sorted = [...counts].sort((left, right) => left - right);
  const sum = counts.reduce((total, count) => total + count, 0);
  const maxChildrenPerParent = sorted[sorted.length - 1];

  return {
    minChildrenPerParent: sorted[0],
    avgChildrenPerParent: Math.round((sum / counts.length) * 100) / 100,
    maxChildrenPerParent,
    p95ChildrenPerParent: percentileFromSorted(sorted, 95),
    p99ChildrenPerParent: percentileFromSorted(sorted, 99),
    isBounded: maxChildrenPerParent > 0 && maxChildrenPerParent <= BOUNDED_CHILDREN_THRESHOLD,
  };
}

/**
 * Derive a conservative distribution when only a developer max is known (Embed Overrides).
 * Min=1, avg≈max/2, p95/p99=max so Architecture Review can size documents without "Unavailable".
 */
export function estimateRelationshipCardinalityFromMax(maxChildrenPerParent: number): RelationshipCardinalityStats {
  const max = Math.max(1, Math.round(maxChildrenPerParent));
  return {
    minChildrenPerParent: 1,
    avgChildrenPerParent: Math.max(1, Math.ceil(max / 2)),
    maxChildrenPerParent: max,
    p95ChildrenPerParent: max,
    p99ChildrenPerParent: max,
    isBounded: max <= DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN,
  };
}

/** True when measured or estimated stats are present (max > 0). */
export function hasRelationshipCardinalityStats(stats: Partial<RelationshipCardinalityStats>): boolean {
  return typeof stats.maxChildrenPerParent === 'number' && stats.maxChildrenPerParent > 0;
}

/** Stable override key shared by UI and server. */
export function relationshipOverrideKey(parts: {
  parentTable: string;
  childTable: string;
  fkColumn: string;
}): string {
  return `${parts.parentTable}::${parts.childTable}::${parts.fkColumn}`;
}
