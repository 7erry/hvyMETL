import { once } from 'node:events';
import type { Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { WebSocket } from 'ws';
import { attachLiveAgentWebSocket } from './liveAgentWs.js';
import { createLiveAgentSession, createLiveAgentStudioRouter, readExtractJob, readLiveAgentResult } from './liveAgent.js';

describe('live agent WebSocket', () => {
  const sockets: WebSocket[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it('accepts schema over /api/agent/v2 and starts extract staging', async () => {
    const stagingRoot = mkdtempSync(join(tmpdir(), 'hvymetl-agent-ws-'));
    const session = createLiveAgentSession({ wantExtract: true, stagingRoot });
    const app = express();
    app.use(express.json());
    app.use('/api/schema', createLiveAgentStudioRouter());
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    attachLiveAgentWebSocket(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/agent/v2?token=${session.token}`);
    sockets.push(ws);
    if (ws.readyState !== WebSocket.OPEN) await once(ws, 'open');
    const inbox: Record<string, unknown>[] = [];
    ws.on('message', (raw) => {
      inbox.push(JSON.parse(String(raw)) as Record<string, unknown>);
    });
    ws.send(JSON.stringify({ type: 'hello', protocol: 1, agentVersion: '10.0.0', engines: ['postgresql'] }));

    const waitFor = async (type: string): Promise<Record<string, unknown>> => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const hit = inbox.find((payload) => payload.type === type);
        if (hit) return hit;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${type}. Got: ${inbox.map((payload) => payload.type).join(',')}`);
    };

    await waitFor('welcome');
    await waitFor('introspect');

    ws.send(
      JSON.stringify({
        type: 'schema',
        model: {
          source: 'ddl:postgresql',
          tables: [
            {
              name: 'users',
              columns: [{ name: 'id', sqlType: 'int', bsonType: 'int', nullable: false, isPrimaryKey: true }],
              primaryKey: ['id'],
              foreignKeys: [],
              rowCount: 2,
            },
          ],
          relationships: [],
        },
        ddl: '// Live PostgreSQL database shop. Schema read from the catalog.\n',
        dialect: 'postgresql',
      }),
    );

    await waitFor('schema_ok');
    const extractMsg = await waitFor('extract');
    expect((extractMsg.tables as { name: string }[])[0]?.name).toBe('users');

    ws.send(
      JSON.stringify({
        type: 'extract_chunk',
        jobId: extractMsg.jobId,
        table: 'users',
        checkpoint: '1',
        columns: ['id'],
        rows: [[1], [2]],
        eof: true,
      }),
    );
    await waitFor('ack');
    await waitFor('extract_complete');

    expect(readLiveAgentResult(session.token)?.result?.dialect).toBe('postgresql');
    expect(readExtractJob(session.token)?.status).toBe('complete');
  }, 15_000);

  it('rejects an expired or missing token on upgrade', async () => {
    const app = express();
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    attachLiveAgentWebSocket(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/agent/v2?token=missing`);
      sockets.push(ws);
      ws.on('open', () => reject(new Error('should not open')));
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(401);
        resolve();
      });
      ws.on('error', () => resolve());
    });
  });
});
