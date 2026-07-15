import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AtlasLogsApiError,
  configureAtlasLogsRuntime,
  describeAtlasLogHostNameIssue,
  extractAtlasBlockedIp,
  fetchAtlasDatabaseLogs,
  fetchAtlasProcessHostNames,
  fetchAtlasProjectEvents,
  getAtlasAccessToken,
  getAtlasLogsStatus,
  isAtlasLogFileName,
  isAtlasShardNodeHostName,
  isAtlasTenantClusterLogUnsupportedDetail,
  looksLikeAtlasClusterConnectionHost,
  normalizeAtlasEnvValue,
  parseAtlasAdminApiFailure,
  readAtlasLogsConfig,
  shouldSkipAtlasLogHostNameEnrichment,
  suggestAtlasShardHostName,
} from './atlasLogs.js';

const TEST_CONFIG = {
  clientId: 'mdb_sa_id_test',
  clientSecret: 'mdb_sa_sk_test',
  groupId: '69aaf1b29abbbbe753fea212',
  hostName: 'cluster0-shard-00-00.abc12.mongodb.net',
};

function mockFetch(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>): void {
  configureAtlasLogsRuntime({
    fetchFn: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern)) return handler(init);
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }),
    clearTokenCache: true,
  });
}

describe('atlasLogs', () => {
  beforeEach(() => {
    configureAtlasLogsRuntime({ clearTokenCache: true });
  });

  afterEach(() => {
    configureAtlasLogsRuntime({ clearTokenCache: true });
  });

  it('normalizes env values with trailing hash or quotes', () => {
    expect(normalizeAtlasEnvValue('69aaf1b29abbbbe753fea212#')).toBe('69aaf1b29abbbbe753fea212');
    expect(normalizeAtlasEnvValue('"mdb_sa_id_test"')).toBe('mdb_sa_id_test');
  });

  it('reads config when required env vars are present', () => {
    const config = readAtlasLogsConfig({
      ATLAS_CLIENT_ID: TEST_CONFIG.clientId,
      ATLAS_CLIENT_SECRET: TEST_CONFIG.clientSecret,
      ATLAS_GROUP_ID: `${TEST_CONFIG.groupId}#`,
      ATLAS_NODE_HOSTNAME: TEST_CONFIG.hostName,
    });
    expect(config).toEqual(TEST_CONFIG);
  });

  it('reports unconfigured status when credentials are missing', () => {
    expect(getAtlasLogsStatus({})).toEqual({ configured: false, hasHostName: false });
  });

  it('detects cluster connection hostname vs shard node hostname', () => {
    expect(isAtlasShardNodeHostName('cluster0-shard-00-00.abc12.mongodb.net')).toBe(true);
    expect(isAtlasShardNodeHostName('myfreecluster.5thctns.mongodb.net')).toBe(false);
    expect(looksLikeAtlasClusterConnectionHost('myfreecluster.5thctns.mongodb.net')).toBe(true);
    expect(suggestAtlasShardHostName('myfreecluster.5thctns.mongodb.net')).toBe(
      'myfreecluster-shard-00-00.5thctns.mongodb.net',
    );
  });

  it('flags invalid ATLAS_NODE_HOSTNAME in status', () => {
    const status = getAtlasLogsStatus({
      ATLAS_CLIENT_ID: TEST_CONFIG.clientId,
      ATLAS_CLIENT_SECRET: TEST_CONFIG.clientSecret,
      ATLAS_GROUP_ID: TEST_CONFIG.groupId,
      ATLAS_NODE_HOSTNAME: 'myfreecluster.5thctns.mongodb.net',
    });
    expect(status.hostNameLooksValid).toBe(false);
    expect(status.hostNameHint).toContain('myfreecluster-shard-00-00.5thctns.mongodb.net');
  });

  it('rejects cluster connection hostname before calling Atlas log download API', async () => {
    const fetchFn = vi.fn();
    configureAtlasLogsRuntime({ fetchFn, clearTokenCache: true });

    await expect(
      fetchAtlasDatabaseLogs(
        { ...TEST_CONFIG, hostName: 'myfreecluster.5thctns.mongodb.net' },
        { token: 'token-abc' },
      ),
    ).rejects.toMatchObject({
      name: 'AtlasLogsApiError',
      httpStatus: 400,
      code: 'INVALID_HOSTNAME',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(describeAtlasLogHostNameIssue('myfreecluster.5thctns.mongodb.net')).toContain('-shard-00-00');
  });

  it('lists process hostnames for log download hints', async () => {
    configureAtlasLogsRuntime({
      fetchFn: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('/processes');
        return new Response(
          JSON.stringify({
            results: [
              { hostname: 'internal-host', userAlias: 'myfreecluster-shard-00-00.5thctns.mongodb.net' },
              { hostname: 'myfreecluster-shard-00-01.5thctns.mongodb.net' },
            ],
          }),
          { status: 200 },
        );
      }),
      clearTokenCache: true,
    });

    await expect(fetchAtlasProcessHostNames(TEST_CONFIG, { token: 'token-abc' })).resolves.toEqual([
      'myfreecluster-shard-00-00.5thctns.mongodb.net',
      'myfreecluster-shard-00-01.5thctns.mongodb.net',
    ]);
  });

  it('obtains and caches OAuth access token', async () => {
    let oauthCalls = 0;
    mockFetch({
      '/api/oauth/token': () => {
        oauthCalls += 1;
        return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), { status: 200 });
      },
    });

    await expect(getAtlasAccessToken(TEST_CONFIG)).resolves.toBe('token-abc');
    await expect(getAtlasAccessToken(TEST_CONFIG)).resolves.toBe('token-abc');
    expect(oauthCalls).toBe(1);
  });

  it('rejects invalid group ids', () => {
    expect(() =>
      readAtlasLogsConfig({
        ATLAS_CLIENT_ID: 'id',
        ATLAS_CLIENT_SECRET: 'secret',
        ATLAS_GROUP_ID: 'not-a-valid-project-id',
      }),
    ).toThrow(/24-character hexadecimal/);
  });

  it('fetches project events from the atlas v2 API', async () => {
    configureAtlasLogsRuntime({
      fetchFn: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/oauth/token')) {
          return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), { status: 200 });
        }
        expect(url).toContain('https://cloud.mongodb.com/api/atlas/v2/groups/');
        expect(url).toContain('/events');
        const headers = new Headers(init?.headers);
        expect(headers.get('Accept')).toBe('application/vnd.atlas.2025-02-19+json');
        return new Response(
          JSON.stringify({
            results: [{ id: '1', eventTypeName: 'CLUSTER_CREATED', created: '2026-01-01T00:00:00Z' }],
            totalCount: 1,
          }),
          { status: 200 },
        );
      }),
      clearTokenCache: true,
    });

    const result = await fetchAtlasProjectEvents(TEST_CONFIG, { token: 'token-abc' });
    expect(result.totalCount).toBe(1);
    expect(result.events[0]?.eventTypeName).toBe('CLUSTER_CREATED');
  });

  it('downloads and decompresses database logs', async () => {
    const payload = gzipSync(Buffer.from('line one\nline two\nline three\n', 'utf-8'));
    configureAtlasLogsRuntime({
      fetchFn: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toContain('https://cloud.mongodb.com/api/atlas/v2/groups/');
        expect(url).toContain('/logs/mongodb.gz');
        const headers = new Headers(init?.headers);
        expect(headers.get('Accept')).toBe('application/vnd.atlas.2025-03-12+gzip');
        return new Response(payload, { status: 200 });
      }),
      clearTokenCache: true,
    });

    const result = await fetchAtlasDatabaseLogs(TEST_CONFIG, {
      token: 'token-abc',
      maxLines: 2,
    });
    expect(result.lineCount).toBe(3);
    expect(result.lines).toEqual(['line two', 'line three']);
    expect(result.truncated).toBe(true);
  });

  it('extracts blocked IP from Atlas error payload', () => {
    expect(
      extractAtlasBlockedIp('IP address 104.30.164.7 is not allowed to access this resource.', ['104.30.164.7']),
    ).toBe('104.30.164.7');
  });

  it('maps IP access list failures to actionable errors', () => {
    const error = parseAtlasAdminApiFailure(
      403,
      JSON.stringify({
        detail: 'IP address 104.30.164.7 is not allowed to access this resource.',
        error: 403,
        errorCode: 'IP_ADDRESS_NOT_ON_ACCESS_LIST',
        parameters: ['104.30.164.7'],
      }),
      'Atlas project events request',
    );
    expect(error).toBeInstanceOf(AtlasLogsApiError);
    expect(error.httpStatus).toBe(403);
    expect(error.blockedIp).toBe('104.30.164.7');
    expect(error.message).toContain('104.30.164.7');
    expect(error.hint).toContain('IP Access List');
  });

  it('maps unauthorized log download to cluster log viewer hint', () => {
    const error = parseAtlasAdminApiFailure(
      401,
      JSON.stringify({
        detail: 'Current user is not authorized to perform this action.',
        error: 401,
        errorCode: 'USER_UNAUTHORIZED',
      }),
      'Atlas database log download',
    );
    expect(error.code).toBe('USER_UNAUTHORIZED');
    expect(error.message).toContain('cluster logs');
    expect(error.hint).toContain('Project Cluster Log Viewer');
  });

  it('maps invalid hostname failures to shard node guidance', () => {
    const error = parseAtlasAdminApiFailure(
      400,
      JSON.stringify({
        detail: 'Invalid hostname myfreecluster.5thctns.mongodb.net.',
        error: 400,
      }),
      'Atlas database log download',
    );
    expect(error.code).toBe('INVALID_HOSTNAME');
    expect(error.hint).toContain('-shard-00-00');
    expect(error.hint).toContain('M0');
  });

  it('maps tenant cluster log failures to tier guidance without hostname enrichment', () => {
    const error = parseAtlasAdminApiFailure(
      400,
      JSON.stringify({
        detail: 'Logs for host not supported on tenant clusters.',
        error: 400,
      }),
      'Atlas database log download',
    );
    expect(error.code).toBe('TENANT_CLUSTER_LOGS_UNSUPPORTED');
    expect(error.message).toContain('not supported on this Atlas cluster tier');
    expect(error.hint).toContain('M10');
    expect(isAtlasTenantClusterLogUnsupportedDetail('Logs for host not supported on tenant clusters.')).toBe(true);
    expect(shouldSkipAtlasLogHostNameEnrichment(error)).toBe(true);
  });

  it('validates log file names', () => {
    expect(isAtlasLogFileName('mongodb.gz')).toBe(true);
    expect(isAtlasLogFileName('invalid.log')).toBe(false);
  });
});
