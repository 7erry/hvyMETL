/**
 * Thin wrapper around the external csvToAtlas CLI (CSV_TO_ATLAS_PATH in .env).
 * Translates `--db <name>` into MONGODB_DB for csvToAtlas.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyImportDbFlag, buildImportCliInvocation } from '../dist/utilities/csvToAtlas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  console.error('Usage: import-cli <file.csv...> [collection] [flags]');
  process.exit(1);
}

const env = { ...process.env };
const args = [...rawArgs];

const { flags: forwardedArgs, env: importEnv } = applyImportDbFlag(args, env);
Object.assign(env, importEnv);

const flagStart = forwardedArgs.findIndex((arg) => arg.startsWith('--'));
const csvPaths = flagStart === -1 ? forwardedArgs.slice(0, -1) : forwardedArgs.slice(0, flagStart);
const rest = flagStart === -1 ? forwardedArgs.slice(-1) : forwardedArgs.slice(flagStart);

if (csvPaths.length === 0) {
  console.error('At least one CSV file is required.');
  process.exit(1);
}

let invocation;
try {
  invocation = buildImportCliInvocation(csvPaths, rest);
} catch (error) {
  console.error(String(error));
  process.exit(1);
}

console.error(`csvToAtlas: ${invocation.source.label}`);

const result = spawnSync(invocation.executable, invocation.args, {
  cwd: ROOT,
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
