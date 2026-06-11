/**
 * Tests for the non-overlapping range splitter: the guarantee that parallel
 * workers never extract the same row twice and never miss a row.
 */

import { describe, expect, it } from 'vitest';
import { splitRange, splitTimeRangeAligned } from './splitter.js';

describe('splitRange', () => {
  it('covers the full key span with contiguous, non-overlapping ranges', () => {
    const ranges = splitRange(1, 100, 8);

    // First range starts at min; last range ends just past max (half-open).
    expect(ranges[0].start).toBe(1);
    expect(ranges[ranges.length - 1].end).toBe(101);

    // Each range begins exactly where the previous one ended: no gaps, no overlap.
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].start).toBe(ranges[i - 1].end);
    }
  });

  it('includes the row holding the maximum key', () => {
    const ranges = splitRange(10, 20, 3);
    const lastRange = ranges[ranges.length - 1];
    // Half-open [start, end): key 20 must satisfy start <= 20 < end.
    expect(lastRange.end).toBeGreaterThan(20);
  });

  it('never produces more chunks than there are key values', () => {
    const ranges = splitRange(5, 7, 8); // only 3 possible keys
    expect(ranges.length).toBeLessThanOrEqual(3);
  });

  it('handles a single-row table', () => {
    const ranges = splitRange(42, 42, 8);
    expect(ranges).toEqual([{ start: 42, end: 43 }]);
  });

  it('returns nothing for a zero chunk count', () => {
    expect(splitRange(1, 10, 0)).toEqual([]);
  });
});

describe('splitTimeRangeAligned', () => {
  const HOUR = 3600;

  it('aligns every boundary to whole bucket windows', () => {
    // 7 days of data, 60-minute windows, 8 chunks.
    const min = 1_700_000_123; // deliberately not window-aligned
    const max = min + 7 * 24 * HOUR;
    const ranges = splitTimeRangeAligned(min, max, 8, 60);

    for (const range of ranges) {
      expect(range.start % HOUR).toBe(0);
      expect(range.end % HOUR).toBe(0);
    }
  });

  it('covers min and max inside the aligned span', () => {
    const min = 1_700_000_123;
    const max = min + 24 * HOUR;
    const ranges = splitTimeRangeAligned(min, max, 4, 60);

    expect(ranges[0].start).toBeLessThanOrEqual(min);
    expect(ranges[ranges.length - 1].end).toBeGreaterThan(max);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].start).toBe(ranges[i - 1].end);
    }
  });

  it('produces at least one range even for a tiny span', () => {
    const ranges = splitTimeRangeAligned(100, 200, 8, 60);
    expect(ranges.length).toBeGreaterThanOrEqual(1);
  });
});
