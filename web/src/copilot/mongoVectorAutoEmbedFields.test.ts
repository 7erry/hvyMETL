import { describe, expect, it } from 'vitest';
import {
  formatSchemaFieldPickLabel,
  inferTextFieldPathsFromSchemaTypes,
  listSchemaFieldPickOptions,
} from './mongoVectorAutoEmbedFields';

describe('mongoVectorAutoEmbedFields', () => {
  it('returns paths whose inferred types include string', () => {
    expect(
      inferTextFieldPathsFromSchemaTypes([
        { path: 'title', types: 'string' },
        { path: 'count', types: 'int' },
      ]),
    ).toEqual(['title']);
  });

  it('lists every inferred field for the picklist', () => {
    const options = listSchemaFieldPickOptions([
      { path: 'description', types: 'string' },
      { path: 'price', types: 'double' },
    ]);
    expect(options).toEqual([
      { path: 'description', types: 'string', isStringType: true },
      { path: 'price', types: 'double', isStringType: false },
    ]);
    expect(formatSchemaFieldPickLabel(options[0]!)).toBe('description (string)');
  });
});
