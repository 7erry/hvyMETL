import { beforeEach, describe, expect, it } from 'vitest';
import { buildSizingParametersFromStudioSeed } from './sizingAssistantStudioSeed.js';
import { InMemorySizingSessionStore, setSizingSessionStore } from './sizingAssistantSession.js';
import { applyStudioSeedToSession } from './sizingAssistantStudioSeed.js';

describe('sizingAssistantStudioSeed', () => {
  beforeEach(() => {
    setSizingSessionStore(new InMemorySizingSessionStore());
  });

  it('maps manager scale and workload telemetry into engine parameters', () => {
    const patch = buildSizingParametersFromStudioSeed({
      datasetScale: {
        rawDataSource: 'manager-override',
        managerRawDataGb: 5000,
        rawDataGb: 5000,
        totalStorageGb: 6200,
        activeStorageGb: 5800,
        archiveStorageGb: 400,
        estimatedTotalRows: 2_000_000_000,
        averageDocumentBytes: 2560,
        workloadLabel: 'Catalog',
        growthRatePercent: 12,
        recommendedTierLabel: 'M200',
        requiresSharding: true,
        shardingRecommendations: [],
      },
      peakRpm: 24_000,
      readPercent: 50,
      writePercent: 50,
      workingSetPercent: 42,
      plannedIndexCount: 12,
      compression: 'snappy',
    });

    expect(patch.projected_total_data_size_gb).toBe(6200);
    expect(patch.total_raw_read_ops).toBe(200);
    expect(patch.total_raw_write_ops).toBe(200);
    expect(patch.avg_doc_size_kb).toBe(2.5);
    expect(patch.secondary_index_count).toBe(12);
    expect(patch.active_working_set_percentage).toBeCloseTo(0.42);
    expect(patch.estimated_data_growth_gb_per_month).toBeCloseTo((6200 * 0.12) / 12);
    expect(patch.data_compression_percentage).toBe(0.35);
  });

  it('prefers Atlas inspect hints over design averages', () => {
    const patch = buildSizingParametersFromStudioSeed({
      datasetScale: {
        rawDataSource: 'schema-estimate',
        managerRawDataGb: null,
        rawDataGb: 100,
        totalStorageGb: 120,
        activeStorageGb: 110,
        archiveStorageGb: 10,
        estimatedTotalRows: 1_000_000,
        averageDocumentBytes: 512,
        workloadLabel: null,
        growthRatePercent: 0,
        recommendedTierLabel: null,
        requiresSharding: false,
        shardingRecommendations: [],
      },
      peakRpm: 6000,
      readPercent: 80,
      writePercent: 20,
      atlasInspectHints: { avgDocSizeKb: 2.8, secondaryIndexCount: 5 },
    });

    expect(patch.avg_doc_size_kb).toBe(2.8);
    expect(patch.secondary_index_count).toBe(5);
  });

  it('does not overwrite parameters already set on the session', () => {
    const store = new InMemorySizingSessionStore();
    setSizingSessionStore(store);
    let session = store.create();
    session = {
      ...session,
      parameters: { projected_total_data_size_gb: 900, total_raw_read_ops: 50 },
    };
    store.save(session);

    const result = applyStudioSeedToSession(session, {
      datasetScale: {
        rawDataSource: 'manager-override',
        managerRawDataGb: 5000,
        rawDataGb: 5000,
        totalStorageGb: 5000,
        activeStorageGb: 4800,
        archiveStorageGb: 200,
        estimatedTotalRows: null,
        averageDocumentBytes: 2048,
        workloadLabel: null,
        growthRatePercent: 0,
        recommendedTierLabel: null,
        requiresSharding: false,
        shardingRecommendations: [],
      },
      peakRpm: 6000,
      readPercent: 50,
      writePercent: 50,
    });

    expect(result.session.parameters.projected_total_data_size_gb).toBe(900);
    expect(result.session.parameters.total_raw_read_ops).toBe(50);
    expect(result.appliedKeys).toContain('total_raw_write_ops');
    expect(result.appliedKeys).not.toContain('projected_total_data_size_gb');
  });
});
