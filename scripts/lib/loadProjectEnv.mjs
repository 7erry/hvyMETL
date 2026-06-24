/**
 * Load hvyMETL .env so repo values win over stale shell exports.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';

/** Load `.env` from the repo root, overriding existing process.env keys. */
export function loadProjectEnv(rootDir) {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) return { parsed: undefined, error: undefined };
  return dotenv.config({ path: envPath, override: true });
}
