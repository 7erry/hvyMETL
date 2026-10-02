import { describe, expect, it } from 'vitest';
import { highlightCollectionJsonWithShiki } from './highlightCollectionJsonShiki';

describe('highlightCollectionJsonWithShiki', () => {
  it('returns Shiki markup for JSON', async () => {
    const html = await highlightCollectionJsonWithShiki('{\n  "name": "orders"\n}');
    expect(html).toMatch(/shiki/i);
    expect(html).toContain('orders');
  });
});
