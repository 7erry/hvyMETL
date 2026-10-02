import { describe, expect, it } from 'vitest';
import {
  activeWorkingSetGb,
  ATLAS_PRODUCTION_TIER_MATRIX,
  estimateBaselineIops,
  estimateIndexSizeGb,
  maxAllocatableDiskGb,
  planningStorageGb,
  selectAtlasTierForRequirements,
  targetPhysicalRamGb,
  tierMeetsAtlasGuardrails,
  wiredTigerCacheFraction,
  wiredTigerCacheGb,
  workingSetFitPercent,
} from './atlasTierSizing.js';

describe('wiredTigerCacheFraction', () => {
  it('uses 25% cache on M30 and below, 50% above', () => {
    expect(wiredTigerCacheFraction(8)).toBe(0.25);
    expect(wiredTigerCacheFraction(16)).toBe(0.5);
    expect(wiredTigerCacheGb(32)).toBe(16);
  });
});

describe('disk guardrails', () => {
  it('caps M40 disk at 60:1 RAM before extended ceiling', () => {
    const m40 = ATLAS_PRODUCTION_TIER_MATRIX.find((t) => t.id === 'M40')!;
    expect(maxAllocatableDiskGb(m40)).toBe(960);
  });

  it('allows M50 up to 3840 GB via 120:1 ratio', () => {
    const m50 = ATLAS_PRODUCTION_TIER_MATRIX.find((t) => t.id === 'M50')!;
    expect(maxAllocatableDiskGb(m50)).toBe(3840);
  });
});

describe('selectAtlasTierForRequirements', () => {
  it('steps through M40 then M50 for growing storage with modest RAM', () => {
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 16,
        planningStorageGb: 500,
        indexGb: 2,
        hotFootprintGb: 6,
      }).id,
    ).toBe('M40');
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 16,
        planningStorageGb: 2000,
        indexGb: 2,
        hotFootprintGb: 6,
      }).id,
    ).toBe('M50');
  });

  it('never returns above M300 in production matrix', () => {
    const tier = selectAtlasTierForRequirements({
      requiredRamGb: 400,
      planningStorageGb: 50_000,
      indexGb: 50,
      hotFootprintGb: 150,
    });
    expect(tier.id).toBe('M300');
  });
});

describe('tierMeetsAtlasGuardrails', () => {
  it('requires WiredTiger cache to cover index plus hot footprint', () => {
    const m30 = ATLAS_PRODUCTION_TIER_MATRIX[0]!;
    expect(tierMeetsAtlasGuardrails(m30, 8, 400, 1, 1)).toBe(true);
    expect(tierMeetsAtlasGuardrails(m30, 8, 400, 10, 10)).toBe(false);
  });
});

describe('estimateBaselineIops', () => {
  it('starts at 3000 IOPS under 1 TB and scales by 3 per GB', () => {
    expect(estimateBaselineIops(500)).toBe(3000);
    expect(estimateBaselineIops(1500)).toBe(4500);
  });
});

describe('targetPhysicalRamGb and planningStorageGb', () => {
  it('doubles index plus active working set', () => {
    expect(targetPhysicalRamGb(2, 3)).toBe(10);
  });

  it('uses max of hot and raw on-disk with growth', () => {
    const base = planningStorageGb({
      rawDataGb: 1000,
      activeStorageGb: 200,
      growthRatePercent: 12,
      rawOnDiskMultiplier: 1.33,
      horizonMonths: 12,
    });
    expect(base).toBeCloseTo(1000 * 1.33 * 1.12, 1);
  });
});

describe('estimateIndexSizeGb and activeWorkingSetGb', () => {
  it('scales index and hot slice from on-disk document volume', () => {
    expect(estimateIndexSizeGb(100, 5)).toBe(40);
    expect(activeWorkingSetGb(100, 0.2)).toBe(20);
  });
});

describe('workingSetFitPercent', () => {
  it('caps at 100 when cache exceeds need', () => {
    expect(workingSetFitPercent(1, 1, 64)).toBe(100);
  });
});
