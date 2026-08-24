import { describe, expect, it } from 'vitest';
import { formatRelationshipCardinalityLine } from './formatRelationshipCardinality.js';

describe('formatRelationshipCardinalityLine', () => {
  it('formats measured stats for architecture review grounding', () => {
    const line = formatRelationshipCardinalityLine({
      childTable: 'fx_rates',
      parentTable: 'currencies',
      fkColumn: 'from_currency',
      minChildrenPerParent: 1,
      avgChildrenPerParent: 12.5,
      p95ChildrenPerParent: 40,
      p99ChildrenPerParent: 55,
      maxChildrenPerParent: 60,
      isBounded: true,
      cardinalitySource: 'csv',
    });
    expect(line).toContain('min=1');
    expect(line).toContain('p95=40');
    expect(line).toContain('[csv]');
    expect(line).toContain('bounded=true');
  });

  it('formats developer-estimated stats from Embed Overrides max', () => {
    const line = formatRelationshipCardinalityLine({
      childTable: 'fx_rates',
      parentTable: 'currencies',
      fkColumn: 'from_currency',
      minChildrenPerParent: 1,
      avgChildrenPerParent: 50,
      p95ChildrenPerParent: 100,
      p99ChildrenPerParent: 100,
      maxChildrenPerParent: 100,
      isBounded: true,
      cardinalitySource: 'developer',
    });
    expect(line).toContain('[developer]');
    expect(line).toContain('max=100');
  });

  it('notes DDL-only relationships without stats', () => {
    const line = formatRelationshipCardinalityLine({
      childTable: 'fx_rates',
      parentTable: 'currencies',
      fkColumn: 'from_currency',
      isBounded: false,
      cardinalitySource: 'unknown',
    });
    expect(line).toContain('no stats');
  });
});
