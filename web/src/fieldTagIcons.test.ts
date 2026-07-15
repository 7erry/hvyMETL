import { describe, expect, it } from 'vitest';
import { mongoFieldTagGlyph, mongoFieldTagPrefix, MONGO_FIELD_TAG_GLYPH } from './fieldTagIcons';

describe('fieldTagIcons', () => {
  it('uses the same glyphs as collection nodes for legend labels', () => {
    expect(MONGO_FIELD_TAG_GLYPH.id).toBe('🔑');
    expect(MONGO_FIELD_TAG_GLYPH.embed).toBe('⊕');
    expect(MONGO_FIELD_TAG_GLYPH.denorm).toBe('⇢');
  });

  it('picks the highest-priority tag when multiple apply', () => {
    expect(mongoFieldTagGlyph(['embed', 'index'])).toBe('⊕');
    expect(mongoFieldTagGlyph(['denorm', 'index'])).toBe('⇢');
    expect(mongoFieldTagPrefix(['id', 'embed'])).toBe('🔑 ');
  });
});
