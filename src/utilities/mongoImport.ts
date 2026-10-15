/**
 * Locate the MongoDB Database Tools `mongoimport` binary.
 * SQL imports stay on csvToAtlas.
 */

import { spawnSync } from 'node:child_process';
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

export type MongoImportMode = 'insert' | 'upsert';

export type MongoImportSpawnResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type MongoImportSpawn = (
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => MongoImportSpawnResult;

export type MongoImportRunOptions = {
  uri: string;
  database: string;
  collection: string;
  filePath: string;
  drop?: boolean;
  jsonArray?: boolean;
  stopOnError?: boolean;
  mode?: MongoImportMode;
  /** Used when mode is upsert. Defaults to `_id`. */
  upsertFields?: string;
  env?: NodeJS.ProcessEnv;
  spawnImport?: MongoImportSpawn;
};

export type MongoImportResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  insertedCount?: number;
  error?: string;
};

const IMPORTED_COUNT = /(\d+) document\(s\) imported successfully/;

/** Flags for one collection import. `--uri` is required: `mongoimport --help` does not read `MONGODB_URI`. */
export function buildMongoImportArgs(options: MongoImportRunOptions): string[] {
  const mode = options.mode ?? 'insert';
  const args = [
    '--uri',
    options.uri,
    '--db',
    options.database,
    '--collection',
    options.collection,
    '--file',
    options.filePath,
    '--type',
    'json',
    '--mode',
    mode,
  ];
  if (mode === 'upsert') {
    args.push('--upsertFields', options.upsertFields ?? '_id');
  }
  if (options.drop) args.push('--drop');
  if (options.jsonArray) args.push('--jsonArray');
  if (options.stopOnError) args.push('--stopOnError');
  return args;
}

/** Read the imported-document count from mongoimport's summary line. */
export function parseMongoImportCount(output: string): number | undefined {
  const match = IMPORTED_COUNT.exec(output);
  if (!match?.[1]) return undefined;
  return Number(match[1]);
}

function defaultSpawn(binary: string, args: string[], env: NodeJS.ProcessEnv): MongoImportSpawnResult {
  const result = spawnSync(binary, args, { encoding: 'utf8', env });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Run one `mongoimport` for a JSON or NDJSON file. */
export function runMongoImport(options: MongoImportRunOptions): MongoImportResult {
  const env = options.env ?? process.env;
  const lookup = resolveMongoImportBinary(env);
  if (!lookup.ok || !lookup.path) {
    return {
      ok: false,
      status: 1,
      stdout: '',
      stderr: '',
      error: lookup.error ?? 'mongoimport not found.',
    };
  }

  const args = buildMongoImportArgs(options);
  const result = (options.spawnImport ?? defaultSpawn)(lookup.path, args, env);
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const insertedCount = parseMongoImportCount(`${stdout}\n${stderr}`);
  const ok = result.status === 0;
  return {
    ok,
    status: result.status ?? 1,
    stdout,
    stderr,
    insertedCount,
    error: ok ? undefined : stderr || stdout || `exit ${result.status}`,
  };
}
