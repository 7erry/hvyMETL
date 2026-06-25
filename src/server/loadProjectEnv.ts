import { existsSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';

/** Load repo `.env` so project values win over stale shell exports. */
export function loadProjectEnv(rootDir: string): void {
  const envPath = join(rootDir, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}
