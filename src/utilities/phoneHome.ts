/**
 * Once-per-day CLI heartbeat: silent background POST when the local cache is stale.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';

const PHONE_HOME_URL = 'https://app.alphatozed.com/api/phone-home';
/** Send at most one heartbeat per 23 hours. */
export const HEARTBEAT_MAX_AGE_MS = 23 * 60 * 60 * 1000;

type HeartbeatCache = {
  lastSentAt: string;
};

/** Default cache file: ~/.hvymetl/heartbeat.json */
export function heartbeatCachePath(): string {
  return join(homedir(), '.hvymetl', 'heartbeat.json');
}

/** True when no cache exists or lastSentAt is at least 23 hours ago. */
export function isHeartbeatStale(lastSentAt: string | undefined, nowMs = Date.now()): boolean {
  if (!lastSentAt) return true;
  const sentMs = Date.parse(lastSentAt);
  if (Number.isNaN(sentMs)) return true;
  return nowMs - sentMs >= HEARTBEAT_MAX_AGE_MS;
}

/** Pick the first non-internal IPv4 address, else loopback. */
export function resolveLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      const isIpv4 = String(entry.family) === '4' || entry.family === 'IPv4';
      if (isIpv4 && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function readHeartbeatCache(cachePath: string): HeartbeatCache | null {
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8')) as HeartbeatCache;
  } catch {
    return null;
  }
}

function writeHeartbeatCache(cachePath: string): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(
    cachePath,
    `${JSON.stringify({ lastSentAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

async function postPhoneHome(appVersion: string, ipAddress: string): Promise<void> {
  const response = await fetch(PHONE_HOME_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ipAddress,
    },
    body: JSON.stringify({ appVersion, path: '/' }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`phone-home ${response.status}`);
  }
}

/**
 * If the heartbeat cache is older than 23 hours, update the cache and POST in the
 * background without blocking the CLI. Failures are swallowed (silent).
 */
export function maybePhoneHome(appVersion: string, options: { cachePath?: string; disabled?: boolean } = {}): void {
  if (options.disabled ?? process.env.HVYMETL_DISABLE_PHONE_HOME === '1') return;

  const cachePath = options.cachePath ?? heartbeatCachePath();
  try {
    const cache = readHeartbeatCache(cachePath);
    if (!isHeartbeatStale(cache?.lastSentAt)) return;

    writeHeartbeatCache(cachePath);
    const ipAddress = resolveLocalIpAddress();
    void postPhoneHome(appVersion, ipAddress).catch(() => {
      // Silent — heartbeat must never affect CLI output or exit codes.
    });
  } catch {
    // Silent — corrupt cache or filesystem errors must not block the CLI.
  }
}
