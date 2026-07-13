import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCsvUploadResponse, safeCsvUploadFilename } from './csvUpload.js';

describe('csvUpload', () => {
  it('sanitizes unsafe upload filenames', () => {
    expect(safeCsvUploadFilename('../etc/passwd')).toBe('passwd');
    expect(safeCsvUploadFilename('orders.csv')).toBe('orders.csv');
    expect(safeCsvUploadFilename('nested/path/users.csv')).toBe('users.csv');
  });

  it('builds upload response from saved CSV files', () => {
    const dir = join(tmpdir(), `hvymetl-csv-upload-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'users.csv'), 'id\n1\n');
    writeFileSync(join(dir, 'orders.csv'), 'id\n1\n');

    const response = buildCsvUploadResponse(dir);
    expect(response.ok).toBe(true);
    expect(response.csvSourcePath).toBe(dir);
    expect(response.fileCount).toBe(2);
    expect(response.files.sort()).toEqual(['orders.csv', 'users.csv']);
  });
});
