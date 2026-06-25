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
