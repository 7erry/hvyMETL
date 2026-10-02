import { describe, expect, it } from 'vitest';
import {
  applyTargetWorkloadProfile,
  DATASET_TIER_SLIDER_ANCHORS_GB,
  TARGET_WORKLOAD_PROFILES,
} from './atlasTargetWorkloadProfiles.js';

describe('applyTargetWorkloadProfile', () => {
  it('floors tier when profile requires higher class', () => {
    expect(applyTargetWorkloadProfile('M30', 'm50')).toBe('M50');
  });

  it('caps M0 profiles at M10', () => {
    expect(applyTargetWorkloadProfile('M80', 'm0')).toBe('M10');
  });

  it('leaves auto unchanged', () => {
    expect(applyTargetWorkloadProfile('M40', 'auto')).toBe('M40');
  });
});

describe('DATASET_TIER_SLIDER_ANCHORS_GB', () => {
  it('spans M10 through M700', () => {
    expect(DATASET_TIER_SLIDER_ANCHORS_GB[0]?.tierId).toBe('M10');
    expect(DATASET_TIER_SLIDER_ANCHORS_GB.at(-1)?.tierId).toBe('M700');
    expect(TARGET_WORKLOAD_PROFILES.some((p) => p.id === 'flex')).toBe(true);
  });
});
