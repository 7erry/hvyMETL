import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildCollectionImportCommand,
  buildImportCliInvocation,
  resolveCsvToAtlasInstallation,
  validateCsvToAtlasInstallation,
} from './csvToAtlas.js';

describe('csvToAtlas integration', () => {
  it('throws when CSV_TO_ATLAS_PATH is unset', () => {
    expect(() => resolveCsvToAtlasInstallation(undefined, {})).toThrow(/CSV_TO_ATLAS_PATH/);
  });

  it('resolves external path when CSV_TO_ATLAS_PATH is set', () => {
    const root = mkdtempSync(join(tmpdir(), 'csv-to-atlas-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'csv-to-atlas' }));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/cli.js'), '// cli\n');

    const source = resolveCsvToAtlasInstallation(root);
    expect(source.cliPath).toBe(join(root, 'dist/cli.js'));
    expect(source.packageName).toBe('csv-to-atlas');
  });

  it('validates missing external path', () => {
    const result = validateCsvToAtlasInstallation('/tmp/does-not-exist-hvymetl-csv-to-atlas');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true);
  });

  it('validates unset env path', () => {
    const result = validateCsvToAtlasInstallation(undefined, {});
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('CSV_TO_ATLAS_PATH'))).toBe(true);
  });

  it('builds shell command with quoted paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'csv-to-atlas-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'csv-to-atlas' }));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/cli.js'), '// cli\n');

    const invocation = buildImportCliInvocation(['out/csv/a chunk.csv', 'out/csv/b.csv'], ['products', '--drop'], {
      explicitPath: root,
    });
    expect(invocation.shellCommand).toContain('node');
    expect(invocation.shellCommand).toContain('"out/csv/a chunk.csv"');
    expect(invocation.shellCommand).toContain('products');
    expect(invocation.shellCommand).toContain('--drop');
  });

  it('buildCollectionImportCommand includes collection name', () => {
    const root = mkdtempSync(join(tmpdir(), 'csv-to-atlas-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'csv-to-atlas' }));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/cli.js'), '// cli\n');

    const cmd = buildCollectionImportCommand(['a.csv', 'b.csv'], 'orders', ['--drop'], { explicitPath: root });
    expect(cmd).toContain('orders');
    expect(cmd).toContain('--drop');
  });
});
