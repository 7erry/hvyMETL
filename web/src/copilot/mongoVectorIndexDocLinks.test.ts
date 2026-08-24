import { describe, expect, it } from 'vitest';
import {
  AUTO_EMBED_INDEX_FIELDS_DOC_URL,
  AUTO_EMBED_MODELS_DOC_URL,
} from './mongoVectorIndexDocLinks';

describe('mongoVectorIndexDocLinks', () => {
  it('points embedding model help to Available Models', () => {
    expect(AUTO_EMBED_MODELS_DOC_URL).toContain(
      '/docs/vector-search/crud-embeddings/automated-embedding/#available-models',
    );
  });

  it('points index option help to autoEmbed index fields', () => {
    expect(AUTO_EMBED_INDEX_FIELDS_DOC_URL).toContain('/docs/vector-search/index/vector-search-type/');
    expect(AUTO_EMBED_INDEX_FIELDS_DOC_URL).toContain('embedding=auto');
    expect(AUTO_EMBED_INDEX_FIELDS_DOC_URL).toContain('#mongodb-vector-search-index-fields');
  });
});
