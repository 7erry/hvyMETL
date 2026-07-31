import { describe, expect, it } from 'vitest';
import {
  fieldTypesAllowAutoEmbed,
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

  it('treats unknown inferred types as autoEmbed-eligible', () => {
    expect(fieldTypesAllowAutoEmbed('unknown')).toBe(true);
    expect(fieldTypesAllowAutoEmbed('null | string')).toBe(true);
    expect(fieldTypesAllowAutoEmbed('int')).toBe(false);
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
