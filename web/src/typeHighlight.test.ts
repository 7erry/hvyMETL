import { describe, expect, it } from 'vitest';
import { columnTypeClass, typeHighlight } from './typeHighlight';

describe('typeHighlight', () => {
  it('colors SQL and BSON type labels by family', () => {
    expect(typeHighlight('VARCHAR2(100)')).toBe('string');
    expect(typeHighlight('CHAR(3)')).toBe('string');
    expect(typeHighlight('NUMBER(19)')).toBe('number');
    expect(typeHighlight('BIGINT')).toBe('number');
    expect(typeHighlight('long')).toBe('number');
    expect(typeHighlight('TIMESTAMP')).toBe('date');
    expect(typeHighlight('date')).toBe('date');
    expect(typeHighlight('BOOLEAN')).toBe('bool');
    expect(typeHighlight('null')).toBe('null');
    expect(typeHighlight('binData')).toBe('binary');
    expect(typeHighlight('objectId')).toBe('id');
    expect(typeHighlight('array<object>')).toBe('object');
    expect(typeHighlight('string | null')).toBe('string');
    expect(typeHighlight('character varying(255)')).toBe('string');
    expect(columnTypeClass('DECIMAL(18,2)')).toBe('column-type column-type--number');
    expect(typeHighlight('geometry')).toBeUndefined();
  });
});