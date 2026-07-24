import { describe, expect, it } from 'vitest';
import { buildSaveToDriveFilename } from './architectureExportDownload';

describe('architectureExportDownload', () => {
  it('uses an ASCII filename for Google Save to Drive', () => {
    expect(buildSaveToDriveFilename('# Trains — Architecture Review\n', 'Trains — Architecture Review.md')).toBe(
      'Trains - Architecture Review.md',
    );
  });
});
