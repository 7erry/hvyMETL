import { describe, expect, it } from 'vitest';
import { buildCustomProfileFromInput } from './profiles.js';
import { validateCustomProfileInput } from './customProfileInput.js';

describe('custom profile input', () => {
  it('builds a profile with read preference, write concern, and compression', () => {
    const profile = buildCustomProfileFromInput({
      readPercent: 70,
      writePercent: 30,
      peakRpm: 120000,
      growthRate: '50GB/month',
      readPreference: 'secondaryPreferred',
      writeConcernW: 'majority',
      writeConcernJournal: true,
      compression: 'zstd',
    });
    expect(profile.id).toBe('custom');
    expect(profile.readPreference).toBe('secondaryPreferred');
    expect(profile.compression).toBe('zstd');
    expect(profile.writeConcern).toEqual({ w: 'majority', journal: true });
  });

  it('rejects invalid read/write totals', () => {
    expect(() =>
      validateCustomProfileInput({
        readPercent: 80,
        writePercent: 30,
        peakRpm: 1000,
        growthRate: '1GB/month',
        readPreference: 'primary',
        writeConcernW: 1,
        writeConcernJournal: false,
        compression: 'snappy',
      }),
    ).toThrow(/sum to 100/);
  });
});
