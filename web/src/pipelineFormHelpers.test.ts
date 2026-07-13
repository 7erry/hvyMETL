import { describe, expect, it } from 'vitest';
import {
  hydratePipelineSettingsFromConfig,
  isEnvMongoPlaceholder,
  isLikelyLocalFilesystemPath,
  mongoUriInputValue,
  mongoUriOverrideForFetch,
  resolveHostedCsvSourcePath,
} from './pipelineFormHelpers';

describe('pipelineFormHelpers', () => {
  it('detects env mongo placeholder', () => {
    expect(isEnvMongoPlaceholder('(configured in .env)')).toBe(true);
    expect(isEnvMongoPlaceholder(' mongodb+srv://x ')).toBe(false);
  });

  it('omits placeholder mongo URI from config fetch params', () => {
    expect(mongoUriOverrideForFetch('(configured in .env)')).toBeUndefined();
    expect(mongoUriOverrideForFetch('mongodb+srv://cluster')).toBe('mongodb+srv://cluster');
  });

  it('hides env placeholder in the input value', () => {
    expect(mongoUriInputValue('(configured in .env)')).toBe('');
    expect(mongoUriInputValue('mongodb+srv://cluster')).toBe('mongodb+srv://cluster');
  });

  it('ignores local machine paths on hosted studio', () => {
    expect(isLikelyLocalFilesystemPath('/Users/me/exports')).toBe(true);
    expect(isLikelyLocalFilesystemPath('C:\\exports')).toBe(true);
    expect(resolveHostedCsvSourcePath('/Users/me/exports', true)).toBe('');
    expect(resolveHostedCsvSourcePath('/data/tenant/csv/batch', true)).toBe('/data/tenant/csv/batch');
    expect(resolveHostedCsvSourcePath('/Users/me/exports', false)).toBe('/Users/me/exports');
  });

  it('hydrates empty fields without overwriting user input', () => {
    const status = {
      defaultTargetDb: 'tenant_db',
      csvSourcePath: '/server/csv',
      hasMongoUri: true,
      csvToAtlasResolvedPath: '/opt/csvToAtlas',
      csvToAtlasLabel: 'csvToAtlas',
    };

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: '',
          csvToAtlasPath: '',
          targetDb: '',
          csvSourcePath: '',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: '(configured in .env)',
      csvToAtlasPath: '/opt/csvToAtlas',
      targetDb: 'tenant_db',
      csvSourcePath: '/server/csv',
    });

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: 'mongodb+srv://user:pass@cluster',
          csvToAtlasPath: '/custom/csvToAtlas/path',
          targetDb: 'my_db',
          csvSourcePath: '/my/csv',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: 'mongodb+srv://user:pass@cluster',
      csvToAtlasPath: '/custom/csvToAtlas/path',
      targetDb: 'my_db',
      csvSourcePath: '/my/csv',
    });
  });

  it('preserves partial mongo URI while typing (no reset to placeholder)', () => {
    const status = {
      defaultTargetDb: 'tenant_db',
      csvSourcePath: '',
      hasMongoUri: true,
      csvToAtlasResolvedPath: '/opt/csvToAtlas',
      csvToAtlasLabel: 'csvToAtlas',
    };

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: 'm',
          csvToAtlasPath: '/p',
          targetDb: 'tenant_db',
          csvSourcePath: '',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: 'm',
      csvToAtlasPath: '/p',
      targetDb: 'tenant_db',
      csvSourcePath: '',
    });
  });
});
