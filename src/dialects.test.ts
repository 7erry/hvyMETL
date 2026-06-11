import { describe, expect, it } from 'vitest';
import { inferSchemaDialect, isLiveSourceDialect } from './dialects.js';

describe('dialects', () => {
  it('infers dialect from ddl: source labels', () => {
    expect(inferSchemaDialect({ source: 'ddl:postgresql' }, '')).toBe('postgresql');
    expect(inferSchemaDialect({ source: 'ddl:db2' }, '')).toBe('db2');
  });

  it('prefers session dialect when set', () => {
    expect(inferSchemaDialect({ source: 'ddl:mysql' }, 'postgresql')).toBe('postgresql');
  });

  it('infers sqlite from uploaded file paths', () => {
    expect(inferSchemaDialect({ source: '/tmp/web-uploads/abc123' }, '')).toBe('sqlite');
    expect(inferSchemaDialect({ source: '/data/app.db' }, '')).toBe('sqlite');
  });

  it('marks only sqlite as a live source dialect', () => {
    expect(isLiveSourceDialect('sqlite')).toBe(true);
    expect(isLiveSourceDialect('postgresql')).toBe(false);
  });
});
