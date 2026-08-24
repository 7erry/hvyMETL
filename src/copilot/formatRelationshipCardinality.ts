/**
 * Formats relationship cardinality for Copilot system prompts and Architecture Review grounding.
 */

import { hasRelationshipCardinalityStats } from '../utilities/relationshipCardinalityStats.js';

export type CopilotRelationshipCardinality = {
  childTable: string;
  parentTable: string;
  fkColumn?: string;
  isBounded: boolean;
  minChildrenPerParent?: number;
  avgChildrenPerParent?: number;
  p95ChildrenPerParent?: number;
  p99ChildrenPerParent?: number;
  maxChildrenPerParent?: number;
  /** measured = CSV/SQLite; developer = Embed Overrides max; unknown = DDL-only defaults. */
  cardinalitySource?: 'csv' | 'database' | 'developer' | 'unknown';
};

function formatStat(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : '—';
}

/** One markdown bullet for the Copilot system prompt relationships section. */
export function formatRelationshipCardinalityLine(relationship: CopilotRelationshipCardinality): string {
  const fk = relationship.fkColumn ? ` · ${relationship.fkColumn}` : '';
  const source = relationship.cardinalitySource ?? 'unknown';
  const hasStats = hasRelationshipCardinalityStats(relationship);

  if (!hasStats) {
    return `- ${relationship.childTable} → ${relationship.parentTable}${fk}: no stats (DDL-only — add CSV/.db or Embed Overrides Max)`;
  }

  return [
    `- ${relationship.childTable} → ${relationship.parentTable}${fk}:`,
    `min=${formatStat(relationship.minChildrenPerParent)}`,
    `avg=${formatStat(relationship.avgChildrenPerParent)}`,
    `p95=${formatStat(relationship.p95ChildrenPerParent)}`,
    `p99=${formatStat(relationship.p99ChildrenPerParent)}`,
    `max=${formatStat(relationship.maxChildrenPerParent)}`,
    `[${source}]`,
    `bounded=${relationship.isBounded}`,
  ].join(' ');
}
