import { describe, expect, it } from 'vitest';
import {
  isSizingRecommendationContent,
  sizingRecommendationDocTitle,
  sizingRecommendationFilename,
} from './sizingRecommendationExport.js';

describe('sizingRecommendationExport', () => {
  it('detects recommended cluster and oplog sections', () => {
    const sample = `
## Recommended Cluster Tier & Topology
M50, 3-node replica set, AWS us-east-1.

## Oplog Recommendations
Size oplog for 36h retention at peak write load.

## Sizing & Capacity Breakdown
| Metric | Value |
| --- | --- |
| Data | 400 GB |
`;
    expect(isSizingRecommendationContent(sample)).toBe(true);
  });

  it('builds doc title and filename', () => {
    const content = '# Orders workload\n\n## Recommended Cluster\nM40';
    expect(sizingRecommendationDocTitle(content)).toContain('Atlas Sizing');
    expect(sizingRecommendationFilename(content)).toMatch(/\.md$/);
  });
});
