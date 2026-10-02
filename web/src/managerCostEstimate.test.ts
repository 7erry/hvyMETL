import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel } from './types';
import {
  buildArchiveCollectionOptions,
  buildShardingRecommendations,
  computeManagerCostProjection,
  DEFAULT_MANAGER_COST_INPUTS,
  estimateColumnBytes,
  formatPersonWeeks,
  SHARDING_THRESHOLD_GB,
  selectAtlasTier,
} from './managerCostEstimate';

const model: SqlStructuralModel = {
  source: 'test',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', sqlType: 'BIGINT', bsonType: 'long', nullable: false, isPrimaryKey: true },
        { name: 'email', sqlType: 'VARCHAR(255)', bsonType: 'string', nullable: false, isPrimaryKey: false },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      rowCount: 8_000_000,
    },
    {
      name: 'posts',
      columns: [
        { name: 'id', sqlType: 'BIGINT', bsonType: 'long', nullable: false, isPrimaryKey: true },
        { name: 'body', sqlType: 'TEXT', bsonType: 'string', nullable: false, isPrimaryKey: false },
        { name: 'published_at', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      rowCount: 2_000_000,
    },
  ],
  relationships: [],
};

const plan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: '2026-01-01',
  collections: [
    {
      name: 'users',
      sourceTable: 'users',
      mergedTables: ['users'],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [{ keys: { email: 1 }, options: { name: 'email_1' }, reason: 'lookup' }],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
    {
      name: 'posts',
      sourceTable: 'posts',
      mergedTables: ['posts'],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('managerCostEstimate', () => {
  it('estimates column byte widths from SQL types', () => {
    expect(estimateColumnBytes('BIGINT')).toBe(8);
    expect(estimateColumnBytes('VARCHAR(255)')).toBe(255);
    expect(estimateColumnBytes('TEXT')).toBe(256);
  });

  it('selects atlas tier by RAM, disk ratio, and working-set guardrails', () => {
    expect(selectAtlasTier(8, 400, 0.5, 1.5).id).toBe('M30');
    expect(selectAtlasTier(16, 900, 2, 6).id).toBe('M40');
    expect(selectAtlasTier(32, 2500, 4, 12).id).toBe('M50');
    expect(selectAtlasTier(256, 12_000, 20, 108).id).toBe('M200');
  });

  it('honors target workload profile floor above computed tier', () => {
    const computed = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 8,
      targetWorkloadProfile: 'auto',
    });
    const floored = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 8,
      targetWorkloadProfile: 'm50',
    });
    expect(floored.recommendedTier.id).toBe('M50');
    const tierRank = (id: string) =>
      ['M10', 'M20', 'M30', 'M40', 'M50', 'M60', 'M80', 'M140', 'M200', 'M300', 'M400', 'M700'].indexOf(id);
    expect(tierRank(floored.recommendedTier.id)).toBeGreaterThanOrEqual(tierRank(computed.recommendedTier.id));
  });

  it('increases recommended tier as dataset scale slider rises', () => {
    const tierRank = (id: string) =>
      ['M10', 'M20', 'M30', 'M40', 'M50', 'M60', 'M80', 'M140', 'M200', 'M300', 'M400', 'M700'].indexOf(id);
    let lastRank = -1;
    for (const estimatedDataGb of [128, 512, 2048, 8192]) {
      const { recommendedTier } = computeManagerCostProjection(model, plan, {
        ...DEFAULT_MANAGER_COST_INPUTS,
        estimatedDataGb,
      });
      const rank = tierRank(recommendedTier.id);
      expect(rank).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank;
    }
  });

  it('does not decrease tier when growth rate increases at fixed dataset scale', () => {
    const tierRank = (id: string) =>
      ['M10', 'M20', 'M30', 'M40', 'M50', 'M60', 'M80', 'M140', 'M200', 'M300', 'M400', 'M700'].indexOf(id);
    const low = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 1024,
      growthRatePercent: 0,
    });
    const high = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 1024,
      growthRatePercent: 40,
    });
    expect(tierRank(high.recommendedTier.id)).toBeGreaterThanOrEqual(tierRank(low.recommendedTier.id));
    expect(high.planningStorageGb).toBeGreaterThan(low.planningStorageGb);
  });

  it('sets requiredRamGb from index and active working set with dataset ceiling', () => {
    const projection = computeManagerCostProjection(model, plan, DEFAULT_MANAGER_COST_INPUTS);
    const uncapped = 2 * (projection.indexSizeGb + projection.activeWorkingSetGb);
    expect(projection.requiredRamGb).toBeLessThanOrEqual(uncapped);
    expect(projection.requiredRamGb).toBeGreaterThan(0);
  });

  it('projects monthly and egress costs from schema stats', () => {
    const projection = computeManagerCostProjection(model, plan, DEFAULT_MANAGER_COST_INPUTS);
    expect(projection.hasSchema).toBe(true);
    expect(projection.estimatedTotalRows).toBe(10_000_000);
    expect(projection.totalStorageGb).toBeGreaterThan(0);
    expect(projection.monthlyTotalUsd).toBeGreaterThan(projection.monthlyComputeUsd);
    expect(projection.oneTimeEgressUsd).toBeGreaterThan(0);
    expect(projection.workloadLabel).toContain('Read-heavy');
  });

  it('estimates migration manpower eliminated by hvyMETL assistance', () => {
    const projection = computeManagerCostProjection(model, plan, DEFAULT_MANAGER_COST_INPUTS);
    const categoryTotal = projection.manpowerCategoryBreakdown.reduce(
      (sum, category) => sum + category.personWeeksEliminated,
      0,
    );

    expect(projection.baselineManualPersonWeeks).toBeGreaterThan(projection.hvyMetlAssistedPersonWeeks);
    expect(projection.personWeeksEliminated).toBeGreaterThan(0);
    expect(projection.manpowerReductionPercent).toBeGreaterThanOrEqual(50);
    expect(projection.manpowerCategoryBreakdown.map((category) => category.label)).toEqual([
      'Automates Architecture & Design',
      'Reduces Prototyping Time',
      'Automates Application Code Rewrites',
      'Eliminates Tedious ETL Tasks',
    ]);
    expect(categoryTotal).toBeCloseTo(projection.personWeeksEliminated, 5);
    expect(formatPersonWeeks(projection.personWeeksEliminated)).toContain('person-weeks');
  });

  it('uses user row estimate when schema has no row stats', () => {
    const noStats: SqlStructuralModel = {
      source: 'test',
      tables: [
        {
          name: 't',
          columns: [{ name: 'id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true }],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
        },
      ],
      relationships: [],
    };
    const projection = computeManagerCostProjection(noStats, null, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedTotalRows: 5_000_000,
    });
    expect(projection.estimatedTotalRows).toBe(5_000_000);
  });

  it('offers date-bearing collections for archive cost modeling', () => {
    const options = buildArchiveCollectionOptions(model, plan, DEFAULT_MANAGER_COST_INPUTS);
    expect(options.map((option) => option.collectionName)).toEqual(['posts']);
    expect(options[0].timeField).toBe('publishedAt');
    expect(options[0].isEnabled).toBe(true);
    expect(options[0].retentionYears).toBe(5);
  });

  it('shows non-zero savings for the default optimized archive scenario', () => {
    const projection = computeManagerCostProjection(model, plan, DEFAULT_MANAGER_COST_INPUTS);

    expect(projection.archiveCollectionCount).toBe(1);
    expect(projection.archiveStorageGb).toBeGreaterThan(0);
    expect(projection.baselineMonthlyTotalUsd).toBeGreaterThan(projection.monthlyTotalUsd);
    expect(projection.monthlyManpowerSavingsUsd).toBeGreaterThan(0);
    expect(projection.monthlySavingsUsd).toBeGreaterThan(0);
    expect(projection.savingsPercent).toBeGreaterThan(0);
  });

  it('keeps estimated monthly savings non-zero when only manpower savings apply', () => {
    const projection = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      collectionRetentionYears: { posts: 0 },
    });

    expect(projection.archiveCollectionCount).toBe(0);
    expect(projection.infrastructureMonthlySavingsUsd).toBe(0);
    expect(projection.monthlyManpowerSavingsUsd).toBeGreaterThan(0);
    expect(projection.monthlySavingsUsd).toBe(projection.monthlyManpowerSavingsUsd);
    expect(projection.savingsPercent).toBeGreaterThan(0);
  });

  it('moves older collection bytes into archive storage when retention is enabled', () => {
    const baseline = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      collectionRetentionYears: { posts: 0 },
    });
    const archived = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      collectionRetentionYears: { posts: 2 },
    });

    expect(archived.archiveCollectionCount).toBe(1);
    expect(archived.archiveStorageGb).toBeGreaterThan(0);
    expect(archived.activeStorageGb).toBeLessThan(baseline.activeStorageGb);
    expect(archived.monthlyArchiveUsd).toBeGreaterThan(0);
    expect(archived.baselineMonthlyTotalUsd).toBeGreaterThan(archived.monthlyTotalUsd);
    expect(archived.monthlySavingsUsd).toBeGreaterThan(0);
    expect(archived.savingsPercent).toBeGreaterThan(0);
  });

  it('does not recommend M700 for ~6 TB raw with many planned indexes', () => {
    const manyIndexPlan: MigrationPlan = {
      ...plan,
      collections: plan.collections.map((collection) => ({
        ...collection,
        indexes: Array.from({ length: 30 }, (_, index) => ({
          keys: { [`field${index}`]: 1 as const },
          options: { name: `field${index}_1` },
          reason: 'lookup',
        })),
      })),
    };
    const projection = computeManagerCostProjection(model, manyIndexPlan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 6.2 * 1024,
    });
    expect(projection.rawDataGb).toBeCloseTo(6.2 * 1024, 0);
    expect(projection.recommendedTier.id).not.toBe('M700');
    expect(projection.requiredRamGb).toBeLessThanOrEqual(512);
    expect(projection.planningStorageGb).toBeLessThan(projection.activeStorageGb);
  });

  it('scales projections from a raw data-size override up to 100 TB', () => {
    const projection = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 100 * 1024,
    });

    expect(projection.rawDataGb).toBeCloseTo(100 * 1024, 1);
    expect(projection.totalStorageGb).toBeGreaterThan(projection.rawDataGb);
    expect(projection.estimatedTotalRows).toBeGreaterThan(DEFAULT_MANAGER_COST_INPUTS.estimatedTotalRows);
    expect(['M300', 'M400', 'M700']).toContain(projection.recommendedTier.id);
    expect(projection.requiresSharding).toBe(true);
    expect(projection.shardingRecommendations.length).toBeGreaterThan(0);
    expect(projection.shardingRecommendations[0]?.shardKey).toBeDefined();
    expect(projection.shardingGuidance.some((item) => item.includes('2 TB'))).toBe(true);
  });

  it('does not recommend sharding below the 2 TB threshold', () => {
    const projection = computeManagerCostProjection(model, plan, DEFAULT_MANAGER_COST_INPUTS);
    expect(projection.totalStorageGb).toBeLessThan(SHARDING_THRESHOLD_GB);
    expect(projection.requiresSharding).toBe(false);
    expect(projection.shardingRecommendations).toEqual([]);
  });

  it('prefers hashed time sharding for write-heavy bucket collections at scale', () => {
    const bucketModel: SqlStructuralModel = {
      source: 'test',
      tables: [
        {
          name: 'readings',
          columns: [
            { name: 'sensor_id', sqlType: 'VARCHAR(64)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'recorded_at', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
            { name: 'value', sqlType: 'DOUBLE', bsonType: 'double', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['sensor_id', 'recorded_at'],
          foreignKeys: [],
          rowCount: 50_000_000,
        },
      ],
      relationships: [],
    };
    const bucketPlan: MigrationPlan = {
      source: 'test',
      profileId: 'iot',
      generatedAt: '2026-01-01',
      collections: [
        {
          name: 'readings',
          sourceTable: 'readings',
          mergedTables: ['readings'],
          idDerivation: { sourceColumns: ['sensor_id', 'recorded_at'], strategy: 'composite' },
          patterns: [{ pattern: 'bucket', target: 'readings', reason: 'time series', knowledgeSource: 'test' }],
          jsonSchema: { properties: {} },
          indexes: [],
          embeddedArrays: [],
          extendedReferences: [],
          computedFields: [],
          bucket: {
            groupByColumn: 'sensor_id',
            timeColumn: 'recorded_at',
            windowMinutes: 60,
            measurementsField: 'measurements',
          },
        },
      ],
    };
    const projection = computeManagerCostProjection(bucketModel, bucketPlan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 3 * 1024,
      workloadType: 'write-heavy',
    });
    const { shardingRecommendations } = buildShardingRecommendations(
      bucketModel,
      bucketPlan,
      projection,
      new Map([['readings', projection.activeStorageGb]]),
    );

    expect(shardingRecommendations[0]?.strategy).toBe('compound-hashed');
    expect(shardingRecommendations[0]?.shardKey.recordedAt).toBe('hashed');
  });
});
