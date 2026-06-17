/**
 * Spawn the Python DDL → CSV generator (one CSV per CREATE TABLE).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

/** Sizing knobs passed to generators/ddl_csv_generator.py */
export type MockCsvOptions = {
  baseRowsPerTable?: number;
  childMultiplier?: number;
  minRows?: number;
  maxRows?: number;
  seed?: number;
};

export const MOCK_CSV_DEFAULTS: MockCsvOptions = {
  baseRowsPerTable: 500,
  childMultiplier: 3,
  minRows: 50,
  maxRows: 10000,
  seed: 42,
};

export type MockCsvGenerationResult = {
  outputDir: string;
  tables: string[];
};

/** Absolute path to generators/ddl_csv_generator.py under the repo root. */
export function resolveMockCsvGeneratorScript(rootDir: string): string {
  return join(rootDir, 'generators', 'ddl_csv_generator.py');
}

function listTableCsvNames(outputDir: string): string[] {
  return readdirSync(outputDir)
    .filter((name) => extname(name).toLowerCase() === '.csv')
    .map((name) => name.replace(/\.csv$/i, ''))
    .sort();
}

/**
 * Generate mock CSV files from DDL using Python (pandas + Faker).
 * Requires `pip install -r generators/requirements.txt` and python3 on PATH
 * (or HVYMETL_PYTHON).
 */
export function generateMockCsvFromDdl(
  ddl: string,
  outputDir: string,
  rootDir: string,
  options?: MockCsvOptions,
): MockCsvGenerationResult {
  const script = resolveMockCsvGeneratorScript(rootDir);
  if (!existsSync(script)) {
    throw new Error(`Mock CSV generator not found: ${script}`);
  }

  const python = process.env.HVYMETL_PYTHON?.trim() || 'python3';
  const sizing = { ...MOCK_CSV_DEFAULTS, ...options };

  const args = [
    script,
    '--ddl',
    ddl,
    '--output',
    outputDir,
    '--base-rows',
    String(sizing.baseRowsPerTable ?? MOCK_CSV_DEFAULTS.baseRowsPerTable),
    '--child-multiplier',
    String(sizing.childMultiplier ?? MOCK_CSV_DEFAULTS.childMultiplier),
    '--min-rows',
    String(sizing.minRows ?? MOCK_CSV_DEFAULTS.minRows),
    '--max-rows',
    String(sizing.maxRows ?? MOCK_CSV_DEFAULTS.maxRows),
    '--seed',
    String(sizing.seed ?? MOCK_CSV_DEFAULTS.seed),
  ];

  const result = spawnSync(python, args, {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(
      `Failed to run mock CSV generator (${python}): ${result.error.message}. Install deps: pip install -r generators/requirements.txt`,
    );
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`Mock CSV generation failed: ${detail}`);
  }

  const tables = listTableCsvNames(outputDir);
  if (tables.length === 0) {
    throw new Error('Mock CSV generator produced no .csv files. Check DDL for CREATE TABLE statements.');
  }

  return { outputDir, tables };
}
