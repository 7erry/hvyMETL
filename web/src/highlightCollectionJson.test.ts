import { describe, expect, it } from 'vitest';
import { highlightCollectionJsonManual } from './highlightCollectionJson';

describe('highlightCollectionJsonManual', () => {
  it('colors property keys differently from string values', () => {
    const html = highlightCollectionJsonManual('{\n  "name": "orders",\n  "count": 3,\n  "active": true\n}');
    expect(html).toContain('collection-json__property">"name"');
    expect(html).toContain('collection-json__string">"orders"');
    expect(html).toContain('collection-json__number">3');
    expect(html).toContain('collection-json__boolean">true');
    expect(html).toContain('collection-json__punctuation">:');
  });
});
