/**
 * Spawn the external csvToAtlas CLI for one collection import.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportCliInvocation } from './csvToAtlas.js';

const HVYMETL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export type ImportCliResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  parsed?: Record<string, unknown>;
};

/** Run import-cli for one collection's CSV chunk files. */
export function runImportCli(
  csvPaths: string[],
  collectionName: string,
  flags: string[],
  env: NodeJS.ProcessEnv,
): ImportCliResult {
  const invocation = buildImportCliInvocation(csvPaths, [collectionName, ...flags], {
    explicitPath: env.CSV_TO_ATLAS_PATH?.trim(),
  });

  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: HVYMETL_ROOT,
    encoding: 'utf8',
    env,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout,
    stderr,
    parsed,
  };
}
