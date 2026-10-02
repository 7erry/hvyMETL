import { describe, expect, it } from 'vitest';
import {
  activeWorkingSetGb,
  ATLAS_PRODUCTION_TIER_MATRIX,
  estimateBaselineIops,
  estimateIndexSizeGb,
  maxAllocatableDiskGb,
  planningStorageGb,
  selectAtlasTierForDatasetScale,
  selectAtlasTierForRequirements,
  targetPhysicalRamGb,
  tierRamRequirementGb,
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

  it('allows M50 up to 2 TB extended storage cap', () => {
    const m50 = ATLAS_PRODUCTION_TIER_MATRIX.find((t) => t.id === 'M50')!;
    expect(maxAllocatableDiskGb(m50)).toBe(2048);
  });
});

describe('selectAtlasTierForRequirements', () => {
  it('steps through M40 then M50 for growing storage with modest RAM', () => {
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 16,
        planningStorageGb: 500,
        indexGb: 0,
        hotFootprintGb: 0,
      }).id,
    ).toBe('M40');
    expect(
      selectAtlasTierForRequirements({
        requiredRamGb: 16,
        planningStorageGb: 2000,
        indexGb: 0,
        hotFootprintGb: 0,
      }).id,
    ).toBe('M50');
  });

  it('can reach M700 when storage exceeds M300 extended limits', () => {
    const tier = selectAtlasTierForRequirements({
      requiredRamGb: 400,
      planningStorageGb: 50_000,
      indexGb: 50,
      hotFootprintGb: 150,
    });
    expect(tier.id).toBe('M700');
  });
});

describe('tierMeetsAtlasGuardrails', () => {
  it('checks RAM target and disk ratio only', () => {
    const m30 = ATLAS_PRODUCTION_TIER_MATRIX.find((tier) => tier.id === 'M30')!;
    expect(tierMeetsAtlasGuardrails(m30, 8, 400)).toBe(true);
    expect(tierMeetsAtlasGuardrails(m30, 16, 400)).toBe(false);
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

describe('selectAtlasTierForDatasetScale', () => {
  it('walks storage ladder before large RAM jumps', () => {
    const at32 = selectAtlasTierForDatasetScale({
      planningStorageGb: 53,
      indexGb: 5,
      hotFootprintGb: activeWorkingSetGb(32, 0.2),
    });
    expect(['M10', 'M20', 'M30', 'M40']).toContain(at32.id);
    const at65 = selectAtlasTierForDatasetScale({
      planningStorageGb: 108,
      indexGb: 5,
      hotFootprintGb: activeWorkingSetGb(65, 0.2),
    });
    expect(['M10', 'M20', 'M30', 'M40', 'M50']).toContain(at65.id);
  });
});

describe('estimateIndexSizeGb and activeWorkingSetGb', () => {
  it('caps aggregate index fraction for many indexes', () => {
    const docGb = 7.75 * 1024;
    const few = estimateIndexSizeGb(docGb, 2, 0.08);
    const many = estimateIndexSizeGb(docGb, 63, 0.08);
    expect(many).toBeLessThan(docGb * 0.36);
    expect(many).toBeGreaterThan(few);
  });

  it('caps hot footprint for multi-TB raw data', () => {
    expect(activeWorkingSetGb(6200, 0.2)).toBeLessThan(200);
  });
});

describe('workingSetFitPercent', () => {
  it('caps at 100 when cache exceeds need', () => {
    expect(workingSetFitPercent(1, 1, 64)).toBe(100);
  });
});
