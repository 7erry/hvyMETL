import { describe, expect, it } from 'vitest';
import { inferTextFieldPathsFromSchemaTypes } from './mongoVectorAutoEmbedFields';

describe('inferTextFieldPathsFromSchemaTypes', () => {
  it('returns paths whose inferred types include string', () => {
    expect(
      inferTextFieldPathsFromSchemaTypes([
        { path: 'title', types: 'string' },
        { path: 'count', types: 'int' },
        { path: 'body', types: 'string, null' },
      ]),
    ).toEqual(['title', 'body']);
  });
});
