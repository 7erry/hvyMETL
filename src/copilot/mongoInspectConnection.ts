/**
 * Resolves tenant MongoDB URIs and establishes ephemeral MCP connections for inspect tools.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';
import { isAuthConfigured } from '../server/auth.js';
import { isHostedStudioRequest } from '../server/hosted.js';
import { resolvePipelineCredentials } from '../server/pipelineCredentials.js';
import { getRequestTenantId } from '../server/tenant.js';
import type { MongoMcpToolCaller } from './mongoMcpClient.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** MCP connection id for the server-wide connection string from MDB_MCP_CONNECTION_STRING. */
export const MCP_PRECONFIGURED_CONNECTION_ID = 'preconfigured';

/** User-facing message when hosted tenants have not saved a MongoDB URI. */
export const MONGO_INSPECT_URI_MISSING_MESSAGE =
  'MongoDB connection string is not configured for your workspace. Add it under Pipeline settings, then try again.';

/** User-facing message when MCP preconfigured connection is invalid and no tenant URI is available. */
export const MONGO_INSPECT_PRECONFIGURED_INVALID_MESSAGE =
  'MongoDB inspect could not connect to Atlas. Add your connection string under Pipeline settings, or configure MDB_MCP_CONNECTION_STRING on the MCP server.';

export type MongoInspectMcpConnection = {
  connectionId: string;
  /** When true, disconnect when the MCP session ends. */
  ephemeral: boolean;
};

/** Resolve the MongoDB URI for inspect using the same rules as pipeline imports. */
export function resolveMongoInspectMongoUri(req: Request): string | undefined {
  const hosted = isHostedStudioRequest(req);
  const authEnabled = isAuthConfigured();
  let tenantId: string;
  try {
    tenantId = getRequestTenantId(req);
  } catch {
    tenantId = 'local-dev';
  }

  const creds = resolvePipelineCredentials(ROOT, tenantId, {
    hosted,
    authEnabled,
    overrides: {},
  });
  return creds.mongoUri?.trim() || undefined;
}

function parseConnectConnectionId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const connectionId = (raw as { connectionId?: unknown }).connectionId;
  return typeof connectionId === 'string' && connectionId.trim() ? connectionId.trim() : undefined;
}

/**
 * Establish an MCP MongoDB connection for one inspect session.
 * Hosted tenants always dial with their saved URI; local dev falls back to preconfigured when unset.
 */
export async function ensureMongoInspectMcpConnection(
  callTool: MongoMcpToolCaller,
  mongoUri: string | undefined,
  options: { hosted: boolean; authEnabled: boolean },
): Promise<MongoInspectMcpConnection> {
  if (!mongoUri) {
    if (options.hosted && options.authEnabled) {
      throw new Error(MONGO_INSPECT_URI_MISSING_MESSAGE);
    }
    return { connectionId: MCP_PRECONFIGURED_CONNECTION_ID, ephemeral: false };
  }

  const raw = await callTool('connect', {
    connectionString: mongoUri,
    connectionName: 'hvymetl',
  });
  const connectionId = parseConnectConnectionId(raw);
  if (connectionId) {
    return { connectionId, ephemeral: connectionId !== MCP_PRECONFIGURED_CONNECTION_ID };
  }

  // Legacy MCP connect tools return { connected: true } without a handle — session default applies.
  return { connectionId: MCP_PRECONFIGURED_CONNECTION_ID, ephemeral: false };
}

/** Close ephemeral MCP connections opened for inspect. */
export async function releaseMongoInspectMcpConnection(
  callTool: MongoMcpToolCaller,
  connection: MongoInspectMcpConnection,
): Promise<void> {
  if (!connection.ephemeral) return;
  await callTool('disconnect', { connectionId: connection.connectionId }).catch(() => undefined);
}
