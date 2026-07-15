/**
 * MongoDB Atlas Admin API — OAuth service account auth, project events, and database logs.
 * @see https://www.mongodb.com/docs/atlas/api/
 */

import { gunzipSync } from 'node:zlib';

const ATLAS_OAUTH_URL = 'https://cloud.mongodb.com/api/oauth/token';
const ATLAS_API_BASE = 'https://cloud.mongodb.com/api/atlas/v2';
/** Atlas Admin API version headers (required for v2 resources). */
const ATLAS_EVENTS_ACCEPT = 'application/vnd.atlas.2025-02-19+json';
const ATLAS_LOGS_ACCEPT = 'application/vnd.atlas.2025-03-12+gzip';

const ATLAS_GROUP_ID_PATTERN = /^[a-f0-9]{24}$/i;

export type AtlasLogFileName =
  | 'mongodb.gz'
  | 'mongodb-audit-log.gz'
  | 'mongos.gz'
  | 'mongos-audit-log.gz';

export type AtlasLogsEnvConfig = {
  clientId: string;
  clientSecret: string;
  groupId: string;
  hostName?: string;
};

export type AtlasLogsStatus = {
  configured: boolean;
  hasHostName: boolean;
  groupIdMasked?: string;
};

export type AtlasProjectEvent = {
  id?: string;
  created?: string;
  eventTypeName?: string;
  groupId?: string;
  hostname?: string;
  raw?: Record<string, unknown>;
};

export type AtlasProjectEventsResult = {
  events: AtlasProjectEvent[];
  totalCount: number;
};

export type AtlasDatabaseLogResult = {
  logName: AtlasLogFileName;
  hostName: string;
  lineCount: number;
  lines: string[];
  truncated: boolean;
};

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type AtlasEventsResponse = {
  results?: Record<string, unknown>[];
  totalCount?: number;
};

type FetchFn = typeof fetch;

let cachedAccessToken: { token: string; expiresAtMs: number } | undefined;
let fetchImpl: FetchFn = fetch;

/** Override fetch (tests) or reset token cache between runs. */
export function configureAtlasLogsRuntime(options?: {
  fetchFn?: FetchFn;
  clearTokenCache?: boolean;
}): void {
  if (options?.fetchFn) fetchImpl = options.fetchFn;
  if (options?.clearTokenCache) cachedAccessToken = undefined;
}

/** Strip quotes and trailing punctuation accidentally pasted into env values. */
export function normalizeAtlasEnvValue(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  return unquoted.replace(/[#\s]+$/g, '');
}

/** Read Atlas log API credentials from process env. */
export function readAtlasLogsConfig(env: NodeJS.ProcessEnv = process.env): AtlasLogsEnvConfig | null {
  const clientId = normalizeAtlasEnvValue(env.ATLAS_CLIENT_ID);
  const clientSecret = normalizeAtlasEnvValue(env.ATLAS_CLIENT_SECRET);
  const groupId = normalizeAtlasEnvValue(env.ATLAS_GROUP_ID);
  const hostName = normalizeAtlasEnvValue(env.ATLAS_NODE_HOSTNAME);

  if (!clientId || !clientSecret || !groupId) return null;
  if (!ATLAS_GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(
      `ATLAS_GROUP_ID must be a 24-character hexadecimal Atlas project id (found "${groupId}").`,
    );
  }
  return { clientId, clientSecret, groupId, hostName };
}

/** UI-safe summary of whether Atlas logs can be fetched. */
export function getAtlasLogsStatus(env: NodeJS.ProcessEnv = process.env): AtlasLogsStatus {
  const config = readAtlasLogsConfig(env);
  if (!config) return { configured: false, hasHostName: false };
  return {
    configured: true,
    hasHostName: Boolean(config.hostName),
    groupIdMasked: maskAtlasGroupId(config.groupId),
  };
}

/** Mask Atlas project id for display (show first/last 4 chars). */
export function maskAtlasGroupId(groupId: string): string {
  const trimmed = groupId.trim();
  if (trimmed.length <= 10) return '••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Exchange Atlas service account credentials for a bearer token (cached ~1 hour). */
export async function getAtlasAccessToken(
  config: AtlasLogsEnvConfig,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  if (!options?.forceRefresh && cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now()) {
    return cachedAccessToken.token;
  }

  const authPayload = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetchImpl(ATLAS_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authPayload}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Atlas OAuth authentication failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  const token = data.access_token?.trim();
  if (!token) throw new Error('Atlas OAuth response did not include access_token');

  const ttlSeconds = typeof data.expires_in === 'number' && data.expires_in > 60 ? data.expires_in : 3600;
  cachedAccessToken = {
    token,
    expiresAtMs: Date.now() + (ttlSeconds - 60) * 1000,
  };
  return token;
}

function normalizeAtlasEvent(record: Record<string, unknown>): AtlasProjectEvent {
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    created: typeof record.created === 'string' ? record.created : undefined,
    eventTypeName: typeof record.eventTypeName === 'string' ? record.eventTypeName : undefined,
    groupId: typeof record.groupId === 'string' ? record.groupId : undefined,
    hostname: typeof record.hostname === 'string' ? record.hostname : undefined,
    raw: record,
  };
}

/** Fetch recent Atlas project activity / audit events. */
export async function fetchAtlasProjectEvents(
  config: AtlasLogsEnvConfig,
  options?: { itemsPerPage?: number; pageNum?: number; token?: string },
): Promise<AtlasProjectEventsResult> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const itemsPerPage = Math.min(Math.max(options?.itemsPerPage ?? 20, 1), 500);
  const pageNum = Math.max(options?.pageNum ?? 1, 1);
  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/events?itemsPerPage=${itemsPerPage}&pageNum=${pageNum}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ATLAS_EVENTS_ACCEPT,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Atlas project events request failed (${response.status}): ${errText || response.statusText}`);
  }

  const data = (await response.json()) as AtlasEventsResponse;
  const events = (data.results ?? []).map(normalizeAtlasEvent);
  return {
    events,
    totalCount: typeof data.totalCount === 'number' ? data.totalCount : events.length,
  };
}

const DEFAULT_LOG_NAMES: AtlasLogFileName[] = [
  'mongodb.gz',
  'mongodb-audit-log.gz',
  'mongos.gz',
  'mongos-audit-log.gz',
];

export function isAtlasLogFileName(value: string): value is AtlasLogFileName {
  return (DEFAULT_LOG_NAMES as string[]).includes(value);
}

/** Download and decompress a mongod/mongos log file from Atlas. */
export async function fetchAtlasDatabaseLogs(
  config: AtlasLogsEnvConfig,
  options?: {
    logName?: AtlasLogFileName;
    maxLines?: number;
    token?: string;
    hostName?: string;
  },
): Promise<AtlasDatabaseLogResult> {
  const hostName = options?.hostName?.trim() || config.hostName?.trim();
  if (!hostName) {
    throw new Error('ATLAS_NODE_HOSTNAME is required to download database logs.');
  }

  const logName = options?.logName ?? 'mongodb.gz';
  const maxLines = Math.min(Math.max(options?.maxLines ?? 100, 1), 2000);
  const token = options?.token ?? (await getAtlasAccessToken(config));

  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/clusters/${encodeURIComponent(hostName)}/logs/${encodeURIComponent(logName)}`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ATLAS_LOGS_ACCEPT,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Atlas database log download failed (${response.status}): ${errText || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const decompressed = gunzipSync(Buffer.from(arrayBuffer)).toString('utf-8');
  const allLines = decompressed.split('\n').filter((line) => line.length > 0);
  const truncated = allLines.length > maxLines;
  const lines = truncated ? allLines.slice(-maxLines) : allLines;

  return {
    logName,
    hostName,
    lineCount: allLines.length,
    lines,
    truncated,
  };
}

/** Fetch project events and optional database log preview in one call. */
export async function fetchAtlasLogsSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    itemsPerPage?: number;
    logName?: AtlasLogFileName;
    maxLogLines?: number;
    includeDatabaseLogs?: boolean;
  },
): Promise<{
  status: AtlasLogsStatus;
  events: AtlasProjectEventsResult;
  databaseLogs?: AtlasDatabaseLogResult;
}> {
  const config = readAtlasLogsConfig(env);
  if (!config) {
    throw new Error('Atlas logs are not configured. Set ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET, and ATLAS_GROUP_ID in .env.');
  }

  const token = await getAtlasAccessToken(config);
  const events = await fetchAtlasProjectEvents(config, {
    itemsPerPage: options?.itemsPerPage,
    token,
  });

  let databaseLogs: AtlasDatabaseLogResult | undefined;
  if (options?.includeDatabaseLogs && config.hostName) {
    databaseLogs = await fetchAtlasDatabaseLogs(config, {
      logName: options.logName,
      maxLines: options.maxLogLines,
      token,
    });
  }

  return {
    status: getAtlasLogsStatus(env),
    events,
    databaseLogs,
  };
}
