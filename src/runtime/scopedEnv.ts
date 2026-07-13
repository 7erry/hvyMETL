/**
 * Request-scoped environment overrides (e.g. per-tenant MONGODB_URI / MONGODB_MODEL_KEY).
 * Avoids mutating global process.env during concurrent hosted pipeline runs.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type ScopedEnv = Record<string, string | undefined>;

const storage = new AsyncLocalStorage<ScopedEnv>();

/** Active scoped env store for the current async context, if any. */
export function getScopedEnvStore(): ScopedEnv | undefined {
  return storage.getStore();
}

/** Read one env var from scoped store first, then process.env. */
export function readScopedEnv(key: string): string | undefined {
  const store = storage.getStore();
  const scoped = store?.[key];
  if (typeof scoped === 'string' && scoped.trim()) return scoped.trim();
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim();
  return undefined;
}

/** Run async work with merged scoped env overrides. */
export async function runInScopedEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = storage.getStore() ?? {};
  const merged: ScopedEnv = { ...parent };
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.trim()) merged[key] = value.trim();
    else delete merged[key];
  }
  return storage.run(merged, fn);
}
