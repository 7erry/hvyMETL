import { describe, expect, it } from 'vitest';
import {
  computeRelationshipCardinalityStats,
  estimateRelationshipCardinalityFromMax,
  percentileFromSorted,
} from './relationshipCardinalityStats.js';

describe('relationshipCardinalityStats', () => {
  it('returns zeros for empty counts', () => {
    expect(computeRelationshipCardinalityStats([])).toMatchObject({
      minChildrenPerParent: 0,
      avgChildrenPerParent: 0,
      maxChildrenPerParent: 0,
      p95ChildrenPerParent: 0,
      p99ChildrenPerParent: 0,
      isBounded: false,
    });
  });

  it('computes min/avg/max and percentiles from per-parent counts', () => {
    const stats = computeRelationshipCardinalityStats([1, 1, 2, 2, 3, 10]);
    expect(stats.minChildrenPerParent).toBe(1);
    expect(stats.maxChildrenPerParent).toBe(10);
    expect(stats.avgChildrenPerParent).toBe(3.17);
    expect(stats.p95ChildrenPerParent).toBeGreaterThanOrEqual(3);
    expect(stats.p99ChildrenPerParent).toBeGreaterThanOrEqual(stats.p95ChildrenPerParent);
    expect(stats.isBounded).toBe(true);
  });

  it('marks unbounded when max exceeds embed threshold', () => {
    const stats = computeRelationshipCardinalityStats(Array.from({ length: 20 }, () => 6000));
    expect(stats.maxChildrenPerParent).toBe(6000);
    expect(stats.isBounded).toBe(false);
  });

  it('interpolates percentiles on sorted arrays', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileFromSorted(sorted, 50)).toBe(5.5);
    expect(percentileFromSorted(sorted, 95)).toBe(9.55);
  });

  it('estimates distribution from developer max override', () => {
    expect(estimateRelationshipCardinalityFromMax(100)).toMatchObject({
      minChildrenPerParent: 1,
      avgChildrenPerParent: 50,
      maxChildrenPerParent: 100,
      p95ChildrenPerParent: 100,
      p99ChildrenPerParent: 100,
      isBounded: true,
    });
  });
});
