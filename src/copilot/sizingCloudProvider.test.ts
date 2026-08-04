import { describe, expect, it } from 'vitest';
import {
  defaultRegionForSizingProvider,
  normalizeSizingCloudProvider,
  resolveSizingDeploymentContext,
} from './sizingCloudProvider.js';
import { buildOplogRecommendation } from './sizingOplogRecommendation.js';

describe('sizingCloudProvider', () => {
  it('normalizes provider aliases', () => {
    expect(normalizeSizingCloudProvider('google cloud')).toBe('GCP');
    expect(normalizeSizingCloudProvider('Azure')).toBe('AZURE');
    expect(normalizeSizingCloudProvider('amazon')).toBe('AWS');
  });

  it('defaults regions per provider', () => {
    expect(defaultRegionForSizingProvider('GCP')).toBe('us-central1');
    expect(resolveSizingDeploymentContext({ cloud_provider: 'AZURE' }).targetRegions[0]).toBe('East US');
  });
});

describe('sizingOplogRecommendation', () => {
  it('returns positive oplog size for write load', () => {
    const rec = buildOplogRecommendation({
      projected_total_data_size_gb: 400,
      total_raw_read_ops: 4000,
      total_raw_write_ops: 1500,
      avg_doc_size_kb: 2.5,
    });
    expect(rec.estimatedOplogSizeGb).toBeGreaterThan(0);
    expect(rec.guidance).toMatch(/retention/i);
  });
});
