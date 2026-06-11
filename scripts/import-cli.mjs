/**
 * Delegates `npm run import-cli` to the external csvToAtlas clone when
 * CSV_TO_ATLAS_PATH is set in .env; otherwise uses hvyMETL's bundled CLI.
 *
 * Translates `--db <name>` into MONGODB_DB for the external tool (which reads
 * the database from the environment rather than a CLI flag).
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCsvToAtlasInstallation } from '../dist/utilities/csvToAtlas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  console.error('Usage: import-cli <file.csv...> [collection] [flags]');
  process.exit(1);
}

const env = { ...process.env };
const args = [...rawArgs];

const dbFlagIndex = args.indexOf('--db');
if (dbFlagIndex !== -1 && args[dbFlagIndex + 1]) {
  env.MONGODB_DB = args[dbFlagIndex + 1];
}

const source = resolveCsvToAtlasInstallation();
let forwardedArgs = args;

if (source.mode === 'external') {
  console.error(`csvToAtlas: ${source.label}`);
  if (dbFlagIndex !== -1) {
    forwardedArgs = args.filter((_, index) => index !== dbFlagIndex && index !== dbFlagIndex + 1);
  }
}

const executable = source.mode === 'external' && source.cliPath.endsWith('.ts') ? 'npx' : 'node';
const cliArgs =
  executable === 'npx'
    ? ['tsx', source.cliPath, ...forwardedArgs]
    : [source.cliPath, ...forwardedArgs];

// Always run from hvyMETL root so relative CSV paths (out/<domain>/csv/…) resolve.
const result = spawnSync(executable, cliArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
