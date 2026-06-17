/**
 * CLI: generate mock CSV files from DDL (one file per CREATE TABLE).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateMockCsvFromDdl, MOCK_CSV_DEFAULTS } from '../utilities/mockCsvFromDdl.js';

export type MockCsvCommandOptions = {
  ddlFile?: string;
  ddl?: string;
  outDir: string;
  rootDir: string;
  baseRows?: number;
  childMultiplier?: number;
  minRows?: number;
  maxRows?: number;
  seed?: number;
};

export function runMockCsv(options: MockCsvCommandOptions): { outputDir: string; tables: string[] } {
  const ddl =
    options.ddl?.trim() ||
    (options.ddlFile ? readFileSync(options.ddlFile, 'utf8') : '');
  if (!ddl.trim()) {
    throw new Error('Provide --ddl-file or pipe DDL via stdin (not supported); use --ddl-file.');
  }

  const result = generateMockCsvFromDdl(ddl, options.outDir, options.rootDir, {
    baseRowsPerTable: options.baseRows ?? MOCK_CSV_DEFAULTS.baseRowsPerTable,
    childMultiplier: options.childMultiplier ?? MOCK_CSV_DEFAULTS.childMultiplier,
    minRows: options.minRows ?? MOCK_CSV_DEFAULTS.minRows,
    maxRows: options.maxRows ?? MOCK_CSV_DEFAULTS.maxRows,
    seed: options.seed ?? MOCK_CSV_DEFAULTS.seed,
  });

  console.log(`Generated ${result.tables.length} CSV file(s) in ${result.outputDir}`);
  for (const table of result.tables) {
    console.log(`  ${join(result.outputDir, `${table}.csv`)}`);
  }

  return result;
}
