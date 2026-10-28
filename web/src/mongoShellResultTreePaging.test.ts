import { describe, expect, it } from 'vitest';
import { pageSizeFromViewport } from './components/MongoShellResultTree';

describe('pageSizeFromViewport', () => {
  it('fits roughly one row per 28px after header', () => {
    // 36 header + 20*28 = 596 → 20
    expect(pageSizeFromViewport(596)).toBe(20);
  });

  it('clamps to a usable range', () => {
    // Too short to measure → default 20; huge pane → max 100
    expect(pageSizeFromViewport(40)).toBe(20);
    expect(pageSizeFromViewport(10_000)).toBe(100);
  });
});
