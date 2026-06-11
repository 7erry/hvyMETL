/**
 * Validate csvToAtlas integration (CSV_TO_ATLAS_PATH required).
 * Exits 0 on success, 1 on failure.
 */
import 'dotenv/config';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  buildImportCliInvocation,
  readCsvToAtlasPathFromEnv,
  validateCsvToAtlasInstallation,
  CSV_TO_ATLAS_REPOSITORY,
} from '../dist/utilities/csvToAtlas.js';

function main() {
  const envPath = readCsvToAtlasPathFromEnv();
  console.log(`csvToAtlas repository: ${CSV_TO_ATLAS_REPOSITORY}`);
  console.log(`CSV_TO_ATLAS_PATH: ${envPath ?? '(not set)'}`);

  const validation = validateCsvToAtlasInstallation();
  for (const warning of validation.warnings) {
    console.warn(`WARN: ${warning}`);
  }
  if (!validation.ok) {
    for (const error of validation.errors) {
      console.error(`FAIL: ${error}`);
    }
    process.exit(1);
  }

  console.log(`Resolved: ${validation.source?.label}`);
  console.log(`CLI entry: ${validation.source?.cliPath}`);

  const tmpDir = mkdtempSync(join(tmpdir(), 'hvymetl-csv-validate-'));
  const sampleCsv = join(tmpDir, 'validate_sample.csv');
  writeFileSync(sampleCsv, '_id,name\n1,alpha\n2,beta\n');

  try {
    const invocation = buildImportCliInvocation([sampleCsv], ['--analyze']);
    console.log('\nRunning analyze smoke test…');
    const result = spawnSync(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      encoding: 'utf8',
      env: process.env,
    });

    if (result.status !== 0) {
      console.error(result.stderr || result.stdout || 'analyze command failed');
      process.exit(1);
    }

    const payload = JSON.parse(result.stdout);
    const rowCount = payload.files?.[0]?.rowCount;
    if (rowCount === undefined) {
      console.error('FAIL: analyze response missing files[0].rowCount');
      process.exit(1);
    }

    console.log(`PASS: csvToAtlas analyze OK (${rowCount} rows parsed).`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
