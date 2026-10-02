import { describe, expect, it } from 'vitest';
import {
  activeWorkingSetGb,
  estimateIndexSizeGb,
  planningStorageGb,
  selectAtlasTierForRequirements,
  targetPhysicalRamGb,
  wiredTigerCacheFraction,
  wiredTigerCacheGb,
  workingSetFitPercent,
} from './atlasTierSizing.js';

const TIERS = [
  { id: 'M10', ramGb: 2, storageGb: 128 },
  { id: 'M30', ramGb: 8, storageGb: 512 },
  { id: 'M40', ramGb: 16, storageGb: 1024 },
  { id: 'M50', ramGb: 32, storageGb: 2048 },
  { id: 'M700', ramGb: 768, storageGb: 49152 },
];

describe('wiredTigerCacheFraction', () => {
  it('uses 25% cache on M30 and below, 50% above', () => {
    expect(wiredTigerCacheFraction(8)).toBe(0.25);
    expect(wiredTigerCacheFraction(16)).toBe(0.5);
    expect(wiredTigerCacheGb(32)).toBe(16);
  });
});

describe('targetPhysicalRamGb', () => {
  it('doubles index plus active working set', () => {
    expect(targetPhysicalRamGb(2, 3)).toBe(10);
  });
});

describe('planningStorageGb', () => {
  it('uses max of hot and raw on-disk with 12-month growth', () => {
    const base = planningStorageGb({
      rawDataGb: 1000,
      activeStorageGb: 200,
      growthRatePercent: 12,
      rawOnDiskMultiplier: 1.33,
      horizonMonths: 12,
    });
    expect(base).toBeCloseTo(1000 * 1.33 * 1.12, 1);
  });

  it('prefers hot when larger than raw on-disk', () => {
    const base = planningStorageGb({
      rawDataGb: 10,
      activeStorageGb: 500,
      growthRatePercent: 0,
      rawOnDiskMultiplier: 1.25,
    });
    expect(base).toBe(500);
  });
});

describe('selectAtlasTierForRequirements', () => {
  it('picks smallest tier that satisfies RAM and storage from M30 upward', () => {
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 10,
        requiredStorageGb: 600,
        tiers: TIERS,
        productionMinTierId: 'M30',
      }).id,
    ).toBe('M40');
  });

  it('returns top tier when requirements exceed catalog', () => {
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 2000,
        requiredStorageGb: 100_000,
        tiers: TIERS,
        productionMinTierId: 'M30',
      }).id,
    ).toBe('M700');
  });
});

describe('workingSetFitPercent', () => {
  it('caps at 100 when cache exceeds need', () => {
    expect(workingSetFitPercent(1, 1, 64)).toBe(100);
  });
});

describe('estimateIndexSizeGb and activeWorkingSetGb', () => {
  it('scales index with hot data and index count', () => {
    expect(estimateIndexSizeGb(100, 5)).toBe(40);
    expect(activeWorkingSetGb(100, 0.2)).toBe(20);
  });
});
