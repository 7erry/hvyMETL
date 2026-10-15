/**
 * Locate the MongoDB Database Tools `mongoimport` binary.
 * SQL imports stay on csvToAtlas.
 */

import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter } from 'node:path';

export type MongoImportLookup = {
  ok: boolean;
  path?: string;
  error?: string;
};

/** Resolve `mongoimport` from `MONGOIMPORT_PATH` or `PATH`. */
export function resolveMongoImportBinary(env: NodeJS.ProcessEnv = process.env): MongoImportLookup {
  const configured = env.MONGOIMPORT_PATH?.trim();
  if (configured) {
    if (!isExecutable(configured)) {
      return { ok: false, error: `mongoimport not found at MONGOIMPORT_PATH (${configured}).` };
    }
    return { ok: true, path: configured };
  }

  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = `${dir}/mongoimport`;
    if (isExecutable(candidate)) return { ok: true, path: candidate };
  }

  return {
    ok: false,
    error: 'mongoimport not found. Install MongoDB Database Tools and set MONGOIMPORT_PATH or PATH.',
  };
}

function isExecutable(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
