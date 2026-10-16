import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createLiveMongoImportRouter } from './liveMongoRoute.js';

async function listen(app: express.Express): Promise<{ server: Server; port: number }> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server has no port');
  return { server, port: address.port };
}

describe('POST /import-live', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    delete process.env.HVYMETL_HOSTED;
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it('refuses the hosted studio before opening a database connection', async () => {
    process.env.HVYMETL_HOSTED = '1';
    const app = express();
    app.use(express.json());
    app.use(createLiveMongoImportRouter());
    const { server, port } = await listen(app);
    servers.push(server);

    const res = await fetch(`http://127.0.0.1:${port}/import-live`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uri: 'mongodb://localhost:27017/shop' }),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/hosted studio/);
  });

  it('rejects a non-MongoDB URI without connecting', async () => {
    delete process.env.HVYMETL_HOSTED;
    delete process.env.HVYMETL_HOSTED_URL;
    const app = express();
    app.use(express.json());
    app.use(createLiveMongoImportRouter());
    const { server, port } = await listen(app);
    servers.push(server);

    const res = await fetch(`http://127.0.0.1:${port}/import-live`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uri: 'postgres://localhost/shop', database: 'shop' }),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/mongodb:\/\/ or mongodb\+srv:\/\//);
  });
});
