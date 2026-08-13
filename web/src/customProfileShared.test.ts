import { describe, expect, it } from 'vitest';
import {
  resolveCustomTelemetryInitial,
  workloadProfileToCustomInput,
  type CustomProfileInput,
  type WorkloadProfile,
} from './customProfileShared';

const catalogPreset: WorkloadProfile = {
  id: 'catalog',
  label: 'E-commerce Catalog',
  description: 'Product browsing dominates.',
  telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60000, growthRate: '5GB/month' },
  writeConcern: { w: 1, journal: false },
  readPreference: 'primaryPreferred',
  compression: 'snappy',
  pool: { maxPoolSize: 200, minPoolSize: 20, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
};

const mobilePreset: WorkloadProfile = {
  id: 'mobile',
  label: 'Mobile Backend',
  description: 'Bursty app traffic.',
  telemetry: { readPercent: 80, writePercent: 20, peakRpm: 120000, growthRate: '50GB/month' },
  writeConcern: { w: 1, journal: false },
  readPreference: 'primaryPreferred',
  compression: 'snappy',
  pool: { maxPoolSize: 250, minPoolSize: 25, socketTimeoutMS: 20000, maxIdleTimeMS: 30000 },
};

describe('workloadProfileToCustomInput', () => {
  it('maps preset telemetry and driver tuning into modal form fields', () => {
    expect(workloadProfileToCustomInput(catalogPreset)).toEqual({
      readPercent: 95,
      writePercent: 5,
      peakRpm: 60000,
      growthRate: '5GB/month',
      readPreference: 'primaryPreferred',
      writeConcernW: 1,
      writeConcernJournal: false,
      compression: 'snappy',
    });
  });
});

describe('resolveCustomTelemetryInitial', () => {
  const presets = [catalogPreset, mobilePreset];

  it('seeds from the active preset when profileId is not custom', () => {
    const initial = resolveCustomTelemetryInitial({
      profileId: 'catalog',
      customProfile: null,
      customTelemetryInput: null,
      presets,
    });
    expect(initial.readPercent).toBe(95);
    expect(initial.writePercent).toBe(5);
    expect(initial.peakRpm).toBe(60000);
  });

  it('prefers saved customTelemetryInput when profileId is custom', () => {
    const saved: CustomProfileInput = {
      readPercent: 72,
      writePercent: 28,
      peakRpm: 45000,
      growthRate: '12GB/month',
      readPreference: 'secondaryPreferred',
      writeConcernW: 'majority',
      writeConcernJournal: true,
      compression: 'zstd',
    };
    const initial = resolveCustomTelemetryInitial({
      profileId: 'custom',
      customProfile: null,
      customTelemetryInput: saved,
      presets,
    });
    expect(initial).toEqual(saved);
  });

  it('falls back to customProfile when custom telemetry input was not saved', () => {
    const initial = resolveCustomTelemetryInitial({
      profileId: 'custom',
      customProfile: mobilePreset,
      customTelemetryInput: null,
      presets,
    });
    expect(initial.readPercent).toBe(80);
    expect(initial.peakRpm).toBe(120000);
  });
});
