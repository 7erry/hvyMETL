/**
 * MongoDB Atlas Admin API — OAuth service account auth, project events, and database logs.
 * @see https://www.mongodb.com/docs/atlas/api/
 */

import { gunzipSync } from 'node:zlib';

const ATLAS_OAUTH_URL = 'https://cloud.mongodb.com/api/oauth/token';
const ATLAS_API_BASE = 'https://cloud.mongodb.com/api/atlas/v2';
/** Atlas Admin API version headers (required for v2 resources). */
const ATLAS_EVENTS_ACCEPT = 'application/vnd.atlas.2025-02-19+json';
const ATLAS_PROCESSES_ACCEPT = 'application/vnd.atlas.2025-03-12+json';
const ATLAS_LOGS_ACCEPT = 'application/vnd.atlas.2025-03-12+gzip';

/** Per-node FQDN used by the log download API (not the cluster SRV connection hostname). */
const ATLAS_SHARD_NODE_HOST_PATTERN = /-shard-\d{2}-\d{2}\.[a-z0-9]+\.mongodb\.net$/i;
const ATLAS_MONGODB_NET_SUFFIX = /\.mongodb\.net$/i;

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
  /** Public egress IP of the API server (for Atlas Admin API access list). */
  serverEgressIp?: string;
  /** True when ATLAS_NODE_HOSTNAME looks like a shard/node FQDN (not a cluster connection hostname). */
  hostNameLooksValid?: boolean;
  /** Set when ATLAS_NODE_HOSTNAME appears to be a cluster connection hostname instead of a node FQDN. */
  hostNameHint?: string;
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

export type AtlasLogFetchWarning = {
  error: string;
  hint?: string;
  code?: string;
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

/** True when hostname matches Atlas per-node log download FQDN pattern. */
export function isAtlasShardNodeHostName(hostName: string): boolean {
  return ATLAS_SHARD_NODE_HOST_PATTERN.test(hostName.trim());
}

/** True when hostname looks like a cluster connection string host (missing -shard-00-00 segment). */
export function looksLikeAtlasClusterConnectionHost(hostName: string): boolean {
  const trimmed = hostName.trim();
  if (!ATLAS_MONGODB_NET_SUFFIX.test(trimmed)) return false;
  return !isAtlasShardNodeHostName(trimmed);
}

/** Guess primary replica-set node FQDN from a cluster connection hostname. */
export function suggestAtlasShardHostName(connectionHost: string): string | undefined {
  const trimmed = connectionHost.trim();
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0) return undefined;
  const clusterLabel = trimmed.slice(0, dotIndex);
  const domainSuffix = trimmed.slice(dotIndex);
  if (!clusterLabel || !ATLAS_MONGODB_NET_SUFFIX.test(domainSuffix)) return undefined;
  return `${clusterLabel}-shard-00-00${domainSuffix}`;
}

/** Build actionable copy when ATLAS_NODE_HOSTNAME is not a log-download node FQDN. */
export function describeAtlasLogHostNameIssue(hostName: string): string | undefined {
  const trimmed = hostName.trim();
  if (!trimmed || isAtlasShardNodeHostName(trimmed)) return undefined;

  const suggested = looksLikeAtlasClusterConnectionHost(trimmed)
    ? suggestAtlasShardHostName(trimmed)
    : undefined;

  const parts = [
    'ATLAS_NODE_HOSTNAME must be a per-node FQDN (for example cluster0-shard-00-00.abc12.mongodb.net),',
    'not the cluster connection hostname from MONGODB_URI.',
    'In Atlas → your cluster → Connect → Drivers, open the standard connection string and copy a host',
    'that includes -shard-00-00 (View Monitoring on the cluster also lists node hostnames).',
    'Log download is not available on M0, M2, M5, flex, or serverless tiers.',
  ];
  if (suggested) {
    parts.splice(2, 0, `Try ${suggested} instead of ${trimmed}.`);
  }
  return parts.join(' ');
}

/** UI-safe summary of whether Atlas logs can be fetched. */
export function getAtlasLogsStatus(env: NodeJS.ProcessEnv = process.env): AtlasLogsStatus {
  const config = readAtlasLogsConfig(env);
  if (!config) return { configured: false, hasHostName: false };

  const hostNameHint = config.hostName ? describeAtlasLogHostNameIssue(config.hostName) : undefined;
  return {
    configured: true,
    hasHostName: Boolean(config.hostName),
    groupIdMasked: maskAtlasGroupId(config.groupId),
    hostNameLooksValid: config.hostName ? !hostNameHint : undefined,
    hostNameHint,
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
    throw parseAtlasAdminApiFailure(response.status, errText, 'Atlas OAuth authentication');
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

type AtlasAdminErrorBody = {
  detail?: string;
  error?: number;
  errorCode?: string;
  parameters?: string[];
  reason?: string;
};

/** Structured Atlas Admin API failure for routes and UI hints. */
export class AtlasLogsApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly hint?: string;
  readonly blockedIp?: string;

  constructor(message: string, httpStatus: number, options?: { code?: string; hint?: string; blockedIp?: string }) {
    super(message);
    this.name = 'AtlasLogsApiError';
    this.httpStatus = httpStatus;
    this.code = options?.code;
    this.hint = options?.hint;
    this.blockedIp = options?.blockedIp;
  }
}

/** Extract IPv4 from Atlas error detail text. */
export function extractAtlasBlockedIp(detail: string | undefined, parameters?: string[]): string | undefined {
  const fromParams = parameters?.find((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));
  if (fromParams) return fromParams;
  const match = detail?.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match?.[1];
}

/** True when Atlas indicates log download is unavailable on shared/tenant cluster tiers. */
export function isAtlasTenantClusterLogUnsupportedDetail(detail: string): boolean {
  return /tenant cluster/i.test(detail) && /log/i.test(detail);
}

/** Skip hostname/process hints when the failure is a cluster tier limitation, not a bad host. */
export function shouldSkipAtlasLogHostNameEnrichment(error: unknown): boolean {
  if (error instanceof AtlasLogsApiError) {
    if (error.code === 'TENANT_CLUSTER_LOGS_UNSUPPORTED') return true;
    const combined = `${error.message} ${error.hint ?? ''}`;
    if (isAtlasTenantClusterLogUnsupportedDetail(combined)) return true;
  }
  return false;
}

/** Map Atlas Admin API HTTP failures to actionable errors. */
export function parseAtlasAdminApiFailure(
  httpStatus: number,
  bodyText: string,
  context: string,
): AtlasLogsApiError {
  let parsed: AtlasAdminErrorBody = {};
  try {
    parsed = JSON.parse(bodyText) as AtlasAdminErrorBody;
  } catch {
    // ignore non-JSON bodies
  }

  const blockedIp = extractAtlasBlockedIp(parsed.detail, parsed.parameters);
  if (parsed.errorCode === 'IP_ADDRESS_NOT_ON_ACCESS_LIST' && blockedIp) {
    return new AtlasLogsApiError(
      `Atlas Admin API blocked this server's IP address (${blockedIp}).`,
      httpStatus,
      {
        code: parsed.errorCode,
        blockedIp,
        hint: [
          'Atlas Admin API calls come from the hvyMETL API server, not your browser.',
          `In Atlas → Organization Settings → Access Manager → IP Access List, add ${blockedIp}.`,
          'For local development you can temporarily allow 0.0.0.0/0 (Allow Access from Anywhere).',
          'Cluster Network Access (for MONGODB_URI) is separate from the Admin API IP access list.',
        ].join(' '),
      },
    );
  }

  const invalidHostDetail = parsed.detail?.trim() ?? '';
  const isInvalidHostName =
    httpStatus === 400 &&
    (/invalid hostname/i.test(invalidHostDetail) || parsed.errorCode === 'INVALID_HOSTNAME');

  if (isInvalidHostName) {
    return new AtlasLogsApiError('Atlas rejected the log download hostname.', httpStatus, {
      code: parsed.errorCode ?? 'INVALID_HOSTNAME',
      hint: [
        'Use a per-node FQDN such as mycluster-shard-00-00.abc12.mongodb.net — not the cluster connection hostname',
        '(for example mycluster.abc12.mongodb.net from mongodb+srv://).',
        'Atlas → cluster → View Monitoring lists node hostnames; pick one mongod host.',
        'Log download is not available on M0 free tier, M2, M5, flex, or serverless clusters.',
      ].join(' '),
    });
  }

  const detail = parsed.detail?.trim() || bodyText.trim() || parsed.reason || '';
  if (
    httpStatus === 400 &&
    isAtlasTenantClusterLogUnsupportedDetail(detail)
  ) {
    return new AtlasLogsApiError(
      'Database log download is not supported on this Atlas cluster tier.',
      httpStatus,
      {
        code: parsed.errorCode ?? 'TENANT_CLUSTER_LOGS_UNSUPPORTED',
        hint: [
          'Atlas shared-tier clusters (M0 free, M2, M5, Flex) do not support mongod/mongos log download via the Admin API.',
          'Your node hostname is correct — upgrade to a dedicated cluster (M10 or higher) to enable database log preview.',
          'Project events in the Atlas Logs panel still work on shared tiers.',
        ].join(' '),
      },
    );
  }

  if (parsed.errorCode === 'USER_UNAUTHORIZED' || httpStatus === 401) {
    const isLogDownload = /log download|database log/i.test(context);
    return new AtlasLogsApiError(
      isLogDownload
        ? 'Service account lacks permission to download cluster logs.'
        : 'Service account lacks permission for this Atlas Admin API action.',
      httpStatus,
      {
        code: parsed.errorCode ?? 'USER_UNAUTHORIZED',
        hint: isLogDownload
          ? [
              'Grant the service account **Project Cluster Log Viewer** on this Atlas project',
              '(Atlas → Project Access → Service Accounts → your account → Edit Permissions).',
              'Project Owner also works. Log download is not available on M0, M2, M5, flex, or serverless tiers.',
              'Project events may still load without this role.',
            ].join(' ')
          : [
              'Grant the service account access to this Atlas project (e.g. Project Read Only or Project Owner).',
              'Atlas → Project Access → Service Accounts → your account → Edit Permissions.',
            ].join(' '),
      },
    );
  }

  const detailForMessage = parsed.detail?.trim() || bodyText.trim() || parsed.reason || 'Unknown Atlas error';
  return new AtlasLogsApiError(`${context} failed (${httpStatus}): ${detailForMessage}`, httpStatus, {
    code: parsed.errorCode,
  });
}

async function assertAtlasResponseOk(response: Response, context: string): Promise<void> {
  if (response.ok) return;
  const errText = await response.text();
  throw parseAtlasAdminApiFailure(response.status, errText, context);
}

/** Convert Atlas log errors into UI-safe warning payloads (non-fatal for snapshots). */
export function atlasLogWarningFromError(error: unknown): AtlasLogFetchWarning {
  if (error instanceof AtlasLogsApiError) {
    return { error: error.message, hint: error.hint, code: error.code };
  }
  return { error: String(error) };
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

  await assertAtlasResponseOk(response, 'Atlas project events request');

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

type AtlasProcessRecord = {
  hostname?: string;
  userAlias?: string;
  typeName?: string;
};

type AtlasProcessesResponse = {
  results?: AtlasProcessRecord[];
};

/** List mongod/mongos node hostnames from the Atlas processes API (for log download hints). */
export async function fetchAtlasProcessHostNames(
  config: AtlasLogsEnvConfig,
  options?: { token?: string; limit?: number },
): Promise<string[]> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/processes?itemsPerPage=500&pageNum=1`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ATLAS_PROCESSES_ACCEPT,
    },
  });

  await assertAtlasResponseOk(response, 'Atlas processes request');

  const data = (await response.json()) as AtlasProcessesResponse;
  const limit = Math.min(Math.max(options?.limit ?? 6, 1), 20);
  const hostNames: string[] = [];

  for (const process of data.results ?? []) {
    const candidate = process.userAlias?.trim() || process.hostname?.trim();
    if (!candidate || !ATLAS_MONGODB_NET_SUFFIX.test(candidate)) continue;
    if (!hostNames.includes(candidate)) hostNames.push(candidate);
    if (hostNames.length >= limit) break;
  }

  return hostNames;
}

async function enrichAtlasLogHostNameHint(
  config: AtlasLogsEnvConfig,
  hostName: string,
  hint: string | undefined,
  token?: string,
): Promise<string | undefined> {
  const parts = [hint, describeAtlasLogHostNameIssue(hostName)].filter(Boolean);
  try {
    const processHosts = await fetchAtlasProcessHostNames(config, { token, limit: 3 });
    if (processHosts.length > 0) {
      parts.push(`Example node hostnames in this project: ${processHosts.join(', ')}.`);
    }
  } catch {
    // processes list is best-effort for hints only
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
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

  const hostNameIssue = describeAtlasLogHostNameIssue(hostName);
  if (hostNameIssue) {
    throw new AtlasLogsApiError('ATLAS_NODE_HOSTNAME is not a valid Atlas log download node hostname.', 400, {
      code: 'INVALID_HOSTNAME',
      hint: hostNameIssue,
    });
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

  await assertAtlasResponseOk(response, 'Atlas database log download');

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
  databaseLogWarning?: AtlasLogFetchWarning;
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
  let databaseLogWarning: AtlasLogFetchWarning | undefined;
  if (options?.includeDatabaseLogs && config.hostName) {
    try {
      databaseLogs = await fetchAtlasDatabaseLogs(config, {
        logName: options?.logName,
        maxLines: options?.maxLogLines,
        token,
      });
    } catch (error) {
      const warning = atlasLogWarningFromError(error);
      if (config.hostName && !shouldSkipAtlasLogHostNameEnrichment(error)) {
        warning.hint = await enrichAtlasLogHostNameHint(
          config,
          config.hostName,
          warning.hint,
          token,
        );
      }
      databaseLogWarning = warning;
    }
  }

  return {
    status: getAtlasLogsStatus(env),
    events,
    databaseLogs,
    databaseLogWarning,
  };
}
