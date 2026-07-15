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
});
