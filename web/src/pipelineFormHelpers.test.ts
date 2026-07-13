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
      hasModelKey: false,
      csvToAtlasResolvedPath: '/opt/csvToAtlas',
      csvToAtlasLabel: 'csvToAtlas',
      serverManagedCsvToAtlas: false,
    };

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: '',
          mongodbModelKey: '',
          csvToAtlasPath: '',
          targetDb: '',
          csvSourcePath: '',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: '(configured in .env)',
      mongodbModelKey: '',
      csvToAtlasPath: '/opt/csvToAtlas',
      targetDb: 'tenant_db',
      csvSourcePath: '/server/csv',
    });

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: 'mongodb+srv://user:pass@cluster',
          mongodbModelKey: 'al-test-key',
          csvToAtlasPath: '/custom/csvToAtlas/path',
          targetDb: 'my_db',
          csvSourcePath: '/my/csv',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: 'mongodb+srv://user:pass@cluster',
      mongodbModelKey: 'al-test-key',
      csvToAtlasPath: '/custom/csvToAtlas/path',
      targetDb: 'my_db',
      csvSourcePath: '/my/csv',
    });
  });

  it('uses server-managed csvToAtlas label on hosted studio', () => {
    const status = {
      defaultTargetDb: 'tenant_db',
      csvSourcePath: '',
      hasMongoUri: true,
      hasModelKey: true,
      csvToAtlasResolvedPath: '/opt/csvToAtlas',
      csvToAtlasLabel: 'csvToAtlas',
      serverManagedCsvToAtlas: true,
      tenantSecrets: {
        hasMongoUri: true,
        hasMongodbModelKey: true,
        mongoUriMasked: 'mongodb+srv://…',
        mongodbModelKeyMasked: 'al-…key',
      },
    };

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: '',
          mongodbModelKey: '',
          csvToAtlasPath: '',
          targetDb: '',
          csvSourcePath: '',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: '(configured in .env)',
      mongodbModelKey: '(configured in .env)',
      csvToAtlasPath: '/opt/csvToAtlas',
      targetDb: 'tenant_db',
      csvSourcePath: '',
    });
  });

  it('preserves partial mongo URI while typing (no reset to placeholder)', () => {
    const status = {
      defaultTargetDb: 'tenant_db',
      csvSourcePath: '',
      hasMongoUri: true,
      hasModelKey: false,
      csvToAtlasResolvedPath: '/opt/csvToAtlas',
      csvToAtlasLabel: 'csvToAtlas',
      serverManagedCsvToAtlas: false,
    };

    expect(
      hydratePipelineSettingsFromConfig(
        {
          mongoUri: 'm',
          mongodbModelKey: '',
          csvToAtlasPath: '/p',
          targetDb: 'tenant_db',
          csvSourcePath: '',
        },
        status,
        '',
      ),
    ).toEqual({
      mongoUri: 'm',
      mongodbModelKey: '',
      csvToAtlasPath: '/p',
      targetDb: 'tenant_db',
      csvSourcePath: '',
    });
  });
});
