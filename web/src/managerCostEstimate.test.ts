import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel } from './types';
import {
  buildArchiveCollectionOptions,
  computeManagerCostProjection,
  DEFAULT_MANAGER_COST_INPUTS,
  estimateColumnBytes,
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

  it('selects atlas tier by RAM and storage needs', () => {
    expect(selectAtlasTier(1, 30).id).toBe('M30');
    expect(selectAtlasTier(6, 30).id).toBe('M40');
    expect(selectAtlasTier(100, 1000).id).toBe('M200');
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
    expect(projection.monthlySavingsUsd).toBeGreaterThan(0);
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

  it('scales projections from a raw data-size override up to 21 TB', () => {
    const projection = computeManagerCostProjection(model, plan, {
      ...DEFAULT_MANAGER_COST_INPUTS,
      estimatedDataGb: 21 * 1024,
    });

    expect(projection.rawDataGb).toBeCloseTo(21 * 1024, 1);
    expect(projection.totalStorageGb).toBeGreaterThan(projection.rawDataGb);
    expect(projection.estimatedTotalRows).toBeGreaterThan(DEFAULT_MANAGER_COST_INPUTS.estimatedTotalRows);
    expect(projection.recommendedTier.id).not.toBe('M50');
    expect(['M300', 'M400', 'M700']).toContain(projection.recommendedTier.id);
  });
});
