import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyMockCsvGenerator } from './mockCsvFromDdl.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('verifyMockCsvGenerator', () => {
  it('reports ok when python and deps are available', () => {
    const result = verifyMockCsvGenerator(ROOT);
    if (!result.ok) {
      expect.fail(`expected mock generator ready: ${result.message}`);
    }
    expect(result.python).toBeTruthy();
    expect(result.version).toMatch(/Python/i);
  });

  it('reports missing script when generator file is absent', () => {
    const result = verifyMockCsvGenerator('/tmp/nonexistent-hvymetl-root');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MISSING_SCRIPT');
  });

  it('uses HVYMETL_PYTHON when set', () => {
    const python = process.env.HVYMETL_PYTHON?.trim() || 'python3';
    const result = verifyMockCsvGenerator(ROOT, { HVYMETL_PYTHON: python });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.python).toBe(python);
  });
});

describe('mock csv generator script', () => {
  it('exists in repo', () => {
    expect(existsSync(join(ROOT, 'generators', 'ddl_csv_generator.py'))).toBe(true);
  });
});
