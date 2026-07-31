import { describe, expect, it } from 'vitest';
import { isActiveTimeSeriesOverride, normalizeTimeSeriesOverrides } from './timeSeriesOverrides.js';

describe('timeSeriesOverrides', () => {
  it('normalizes and drops empty timeField entries', () => {
    expect(
      normalizeTimeSeriesOverrides({
        stocks: { timeField: '  date ', metaField: ' ticker ', granularity: 'seconds' },
        empty: { timeField: '', granularity: 'hours' },
      }),
    ).toEqual({
      stocks: { timeField: 'date', metaField: 'ticker', granularity: 'seconds' },
    });
  });

  it('defaults invalid granularity to seconds', () => {
    expect(
      normalizeTimeSeriesOverrides({
        events: { timeField: 'at', granularity: 'days' as 'seconds' },
      }),
    ).toEqual({ events: { timeField: 'at', granularity: 'seconds' } });
  });

  it('isActive requires a non-empty timeField', () => {
    expect(isActiveTimeSeriesOverride(undefined)).toBe(false);
    expect(isActiveTimeSeriesOverride({ timeField: '  ', granularity: 'minutes' })).toBe(false);
    expect(isActiveTimeSeriesOverride({ timeField: 'ts', granularity: 'hours' })).toBe(true);
  });
});
