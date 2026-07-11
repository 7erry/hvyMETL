/**
 * Pre-flight MongoDB checks for pipeline and csvToAtlas import.
 */

import { MongoClient } from 'mongodb';

export type MongoConnectivityFailure = {
  ok: false;
  code: string;
  message: string;
  hint: string;
};

export type MongoConnectivityResult = { ok: true } | MongoConnectivityFailure;

/** Mask credentials in a MongoDB URI for logs. */
export function maskMongoUri(uri: string): string {
  return uri.replace(/\/\/[^@]+@/, '//***@').split('?')[0];
}

function classifyMongoError(error: unknown, uri: string): MongoConnectivityFailure {
  const message = String((error as { message?: string })?.message ?? error);
  const code = (error as { code?: string })?.code;
  const masked = maskMongoUri(uri);

  if (message.includes('querySrv ENOTFOUND') || code === 'ENOTFOUND') {
    const hostMatch = message.match(/_mongodb\._tcp\.([^\s'"]+)/) ?? message.match(/ENOTFOUND ([^\s'"]+)/);
    const host = hostMatch?.[1] ?? 'unknown host';
    return {
      ok: false,
      code: 'ENOTFOUND',
      message: `Cannot resolve MongoDB host "${host}" (DNS ENOTFOUND).`,
      hint:
        `Check MONGODB_URI in .env — the Atlas cluster may be deleted, renamed, or unreachable from this network/VPN.\n` +
        `  URI: ${masked}\n` +
        `  If .env is correct, a stale shell export may still win — run \`unset MONGODB_URI\` or use the updated import-cli (loads .env with override).\n` +
        `  Design + ETL without Atlas: HVYMETL_SKIP_ATLAS_IMPORT=1 npm run run-all-examples`,
    };
  }

  if (message.includes('Authentication failed') || message.includes('auth failed')) {
    return {
      ok: false,
      code: 'AUTH_FAILED',
      message: 'MongoDB authentication failed.',
      hint: `Verify username, password, and IP access list in Atlas for:\n  URI: ${masked}`,
    };
  }

  if (
    message.includes('SSL routines') ||
    message.includes('tlsv1 alert') ||
    message.includes('MongoServerSelectionError')
  ) {
    return {
      ok: false,
      code: 'TLS_OR_SELECTION',
      message: 'MongoDB connection failed during TLS or server selection.',
      hint:
        `Common causes: wrong cluster hostname in MONGODB_URI, cluster deleted/renamed, IP not on Atlas access list, or VPN/firewall blocking Atlas.\n` +
        `  URI: ${masked}\n` +
        `  Fix .env MONGODB_URI to match Atlas → Connect → Drivers. Allow your IP under Network Access.\n` +
        `  If .env is correct, unset a stale shell export: unset MONGODB_URI and restart the UI server.`,
    };
  }

  return {
    ok: false,
    code: code ?? 'CONNECT_FAILED',
    message: message.split('\n')[0],
    hint: `Could not connect to MongoDB. Check MONGODB_URI and network access.\n  URI: ${masked}`,
  };
}

/** Verify that MONGODB_URI resolves and accepts a ping before csvToAtlas import. */
export async function verifyMongoUri(
  uri: string,
  options: { timeoutMs?: number } = {},
): Promise<MongoConnectivityResult> {
  const trimmed = uri?.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: 'MISSING_URI',
      message: 'MONGODB_URI is not set.',
      hint: 'Add MONGODB_URI to .env (see .env.example).',
    };
  }

  const timeoutMs = options.timeoutMs ?? 10_000;
  const client = new MongoClient(trimmed, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
  });

  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    return classifyMongoError(error, trimmed);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors after failed connect
    }
  }
}

export function formatMongoConnectivityFailure(failure: { message: string; hint?: string }): string {
  return `${failure.message}\n${failure.hint ?? ''}`;
}

let cachedServerEgressIp: string | null | undefined;

/** Best-effort public egress IP for hosted deployments (Atlas Network Access allow-list). */
export async function getServerEgressIp(): Promise<string | null> {
  if (cachedServerEgressIp !== undefined) return cachedServerEgressIp;
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      cachedServerEgressIp = null;
      return null;
    }
    const data = (await response.json()) as { ip?: string };
    cachedServerEgressIp = typeof data.ip === 'string' && data.ip.trim() ? data.ip.trim() : null;
  } catch {
    cachedServerEgressIp = null;
  }
  return cachedServerEgressIp;
}

/** Reset cached egress IP (tests). */
export function resetServerEgressIpCache(): void {
  cachedServerEgressIp = undefined;
}

/** Append hosted-app guidance when Atlas rejects the server, not the user's laptop. */
export function enrichHostedMongoHint(
  failure: MongoConnectivityFailure,
  options: { hostedUrl?: string; serverEgressIp?: string | null } = {},
): MongoConnectivityFailure {
  if (failure.ok !== false || failure.code !== 'TLS_OR_SELECTION') return failure;

  const hostedUrl = options.hostedUrl?.trim() || 'https://hvymetl.studio';
  const egress = options.serverEgressIp?.trim();
  const hostedLines = [
    '',
    `Hosted app note (${hostedUrl}): MongoDB is contacted from the studio server, not your browser.`,
    'In Atlas → Network Access, allow the studio server — not just your laptop IP.',
    egress
      ? `  Allow this egress IP: ${egress}`
      : '  For quick testing, add Allow Access from Anywhere (0.0.0.0/0).',
    '  Each Atlas cluster you connect must allow this server.',
  ];

  return {
    ...failure,
    hint: `${failure.hint ?? ''}${hostedLines.join('\n')}`,
  };
}

/** MongoDB rejects creating a DB whose name only differs by case from an existing DB. */
export async function resolveMongoDatabaseNameCasing(
  uri: string,
  requestedDbName: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const trimmedUri = uri?.trim();
  const requested = requestedDbName.trim();
  if (!trimmedUri || !requested) return requested;

  const timeoutMs = options.timeoutMs ?? 10_000;
  const client = new MongoClient(trimmedUri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
  });

  try {
    await client.connect();
    const databases = await client.db('admin').admin().listDatabases({ nameOnly: true });
    const existing = databases.databases.find((database) => database.name.toLowerCase() === requested.toLowerCase());
    return existing?.name ?? requested;
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors after failed connect
    }
  }
}
