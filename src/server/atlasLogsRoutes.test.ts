import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasLogsRouter } from './atlasLogsRoutes.js';
import * as atlasLogs from '../utilities/atlasLogs.js';

describe('atlasLogsRoutes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ATLAS_CLIENT_ID = 'mdb_sa_id_test';
    process.env.ATLAS_CLIENT_SECRET = 'mdb_sa_sk_test';
    process.env.ATLAS_GROUP_ID = '69aaf1b29abbbbe753fea212';
    process.env.ATLAS_NODE_HOSTNAME = 'cluster0-shard-00-00.abc12.mongodb.net';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use('/api/atlas', createAtlasLogsRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  it('returns status when configured', async () => {
    const { status, body } = await getJson('/api/atlas/logs/status');
    expect(status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.hasHostName).toBe(true);
  });

  it('returns 503 when credentials are missing', async () => {
    delete process.env.ATLAS_CLIENT_ID;
    const { status, body } = await getJson('/api/atlas/logs/events');
    expect(status).toBe(503);
    expect(String(body.error)).toContain('not configured');
  });

  it('proxies project events', async () => {
    vi.spyOn(atlasLogs, 'fetchAtlasProjectEvents').mockResolvedValue({
      events: [{ eventTypeName: 'TEST_EVENT' }],
      totalCount: 1,
    });
    const { status, body } = await getJson('/api/atlas/logs/events?itemsPerPage=5');
    expect(status).toBe(200);
    expect(body.totalCount).toBe(1);
  });
});
