import { describe, expect, it } from 'vitest';
import { getPipelineConfigStatus } from './pipelineConfig.js';

describe('getPipelineConfigStatus', () => {
  it('marks csvToAtlasFromEnv when CSV_TO_ATLAS_PATH is in server env', () => {
    const status = getPipelineConfigStatus(
      {
        MONGODB_URI: 'mongodb+srv://cluster',
        CSV_TO_ATLAS_PATH: '/opt/csvToAtlas',
      },
      { generateMockCsv: true },
    );

    expect(status.csvToAtlasFromEnv).toBe(true);
  });

  it('does not mark csvToAtlasFromEnv when only a UI override is provided', () => {
    const status = getPipelineConfigStatus(
      { MONGODB_URI: 'mongodb+srv://cluster' },
      { csvToAtlasPath: '/tmp/csvToAtlas', generateMockCsv: true },
    );

    expect(status.csvToAtlasFromEnv).toBe(false);
    expect(status.hasCsvToAtlas).toBe(false);
  });

  it('requires mongoimport instead of csvToAtlas for JSON Schema', () => {
    const status = getPipelineConfigStatus(
      { MONGODB_URI: 'mongodb://localhost', PATH: '', MONGOIMPORT_PATH: '/missing/mongoimport' },
      { schemaDialect: 'json-schema', generateMockCsv: true },
    );

    expect(status.missing).toContain('mongoimport');
    expect(status.missing).not.toContain('CSV_TO_ATLAS_PATH');
    expect(status.hasMongoImport).toBe(false);
  });

  it('keeps csvToAtlas required for SQL', () => {
    const status = getPipelineConfigStatus(
      { MONGODB_URI: 'mongodb://localhost', PATH: '' },
      { schemaDialect: 'postgresql', generateMockCsv: true },
    );

    expect(status.missing).toContain('CSV_TO_ATLAS_PATH');
    expect(status.missing).not.toContain('mongoimport');
  });
});
