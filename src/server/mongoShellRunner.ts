/**
 * Resolve and spawn real `mongosh` for one-shot script runs.
 * shortcut: no live REPL, upgrade when interactive sessions are needed.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandMongoshShellHelpers } from './mongoShellHelpers.js';

export const MONGOSH_TIMEOUT_MS = 30_000;
export const MONGOSH_MAX_OUTPUT_BYTES = 1_000_000;

export type MongoshStatus = {
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
};

type SpawnedChild = EventEmitter & {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

export type MongoshSpawnFn = (
  command: string,
  args: readonly string[],
  options?: { stdio?: unknown; env?: NodeJS.ProcessEnv },
) => SpawnedChild;

export type MongoshRunInput = {
  uri: string;
  script: string;
  dbName?: string;
  /** Applied to bare find() when the script omits .limit(). */
  findLimit?: number;
  binaryPath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawnFn?: MongoshSpawnFn;
};

export type MongoshRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  truncated?: boolean;
};

function truncate(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8') + '\n…[truncated]', truncated: true };
}

const defaultSpawn: MongoshSpawnFn = (command, args, options) =>
  nodeSpawn(command, args as string[], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options?.env ?? process.env,
  }) as unknown as SpawnedChild;

/** Resolve mongosh binary: HVYMETL_MONGOSH_PATH, else `mongosh` on PATH. */
export async function resolveMongoshBinary(
  spawnFn: MongoshSpawnFn = defaultSpawn,
): Promise<{ path: string } | { error: string }> {
  const configured = process.env.HVYMETL_MONGOSH_PATH?.trim();
  if (configured) return { path: configured };

  return await new Promise((resolve) => {
    const child = spawnFn('mongosh', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      resolve({
        error:
          error.message.includes('ENOENT')
            ? 'mongosh not found. Install MongoDB Shell and ensure it is on PATH, or set HVYMETL_MONGOSH_PATH.'
            : `Cannot start mongosh: ${error.message}`,
      });
    });
    child.on('close', (code: number | null) => {
      if (code === 0) resolve({ path: 'mongosh' });
      else {
        resolve({
          error:
            stderr.trim() ||
            'mongosh not found. Install MongoDB Shell and ensure it is on PATH, or set HVYMETL_MONGOSH_PATH.',
        });
      }
    });
  });
}

export async function getMongoshStatus(spawnFn: MongoshSpawnFn = defaultSpawn): Promise<MongoshStatus> {
  const resolved = await resolveMongoshBinary(spawnFn);
  if ('error' in resolved) {
    return { available: false, error: resolved.error };
  }

  return await new Promise((resolve) => {
    const child = spawnFn(resolved.path, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      resolve({ available: false, path: resolved.path, error: error.message });
    });
    child.on('close', (code: number | null) => {
      const version = stdout.trim() || stderr.trim();
      if (code === 0) {
        resolve({ available: true, path: resolved.path, version: version || undefined });
        return;
      }
      resolve({
        available: false,
        path: resolved.path,
        error: version || `mongosh --version exited with code ${code}`,
      });
    });
  });
}

/** Run a script once via mongosh --file against the given URI. */
export async function runMongoshScript(input: MongoshRunInput): Promise<MongoshRunResult> {
  const spawnFn = input.spawnFn ?? defaultSpawn;
  const timeoutMs = input.timeoutMs ?? MONGOSH_TIMEOUT_MS;
  const maxOutputBytes = input.maxOutputBytes ?? MONGOSH_MAX_OUTPUT_BYTES;
  const uri = input.uri.trim();
  const script = input.script;
  if (!uri) throw new Error('MongoDB URI is required.');
  if (!script.trim()) throw new Error('Script is required.');

  let binary = input.binaryPath?.trim() ?? '';
  if (!binary) {
    const resolved = await resolveMongoshBinary(spawnFn);
    if ('error' in resolved) throw new Error(resolved.error);
    binary = resolved.path;
  }

  const filePath = join(tmpdir(), `hvymetl-mongosh-${randomUUID()}.js`);
  // --file is JS-only; expand `show collections` / `use db` etc. first.
  // Never pass dbName as a mongosh positional — mongosh treats bare positionals as
  // filenames (ENOENT under the server cwd, e.g. .../hvymetl/<dbname>).
  const dbName = input.dbName?.trim();
  const expanded = expandMongoshShellHelpers(script, input.findLimit);
  const scriptBody = dbName
    ? `db = db.getSiblingDB(${JSON.stringify(dbName)});\n${expanded}`
    : expanded;
  await writeFile(filePath, scriptBody, 'utf8');

  const args = [uri, '--quiet', '--file', filePath];

  try {
    return await new Promise<MongoshRunResult>((resolve) => {
      const child = spawnFn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const out = truncate(stdout, maxOutputBytes);
        const err = truncate(stderr, maxOutputBytes);
        resolve({
          ok: !timedOut && exitCode === 0,
          stdout: out.text,
          stderr: err.text,
          exitCode,
          timedOut: timedOut || undefined,
          truncated: out.truncated || err.truncated || undefined,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (Buffer.byteLength(stdout, 'utf8') < maxOutputBytes * 2) {
          stdout += chunk.toString('utf8');
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (Buffer.byteLength(stderr, 'utf8') < maxOutputBytes * 2) {
          stderr += chunk.toString('utf8');
        }
      });
      child.on('error', (error: Error) => {
        stderr = stderr ? `${stderr}\n${error.message}` : error.message;
        finish(1);
      });
      child.on('close', (code: number | null) => {
        finish(code);
      });
    });
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}
