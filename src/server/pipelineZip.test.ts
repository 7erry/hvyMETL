import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { pipelineResultsZipPath, zipDirectory } from './pipelineZip.js';

describe('pipelineZip', () => {
  it('creates a zip archive of pipeline output files', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hvymetl-zip-'));
    try {
      writeFileSync(join(rootDir, 'migration-plan.json'), '{"collections":[]}\n');
      writeFileSync(join(rootDir, 'design-report.md'), '# Report\n');
      const zipPath = pipelineResultsZipPath(rootDir);
      await zipDirectory(rootDir, zipPath);
      const zipBytes = readFileSync(zipPath);
      expect(zipBytes.length).toBeGreaterThan(22);
      expect(zipBytes[0]).toBe(0x50);
      expect(zipBytes[1]).toBe(0x4b);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
