import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { runLiveAgent } from '../utilities/runLiveAgent.js';
import {
  createLiveAgentPublicRouter,
  createLiveAgentSession,
  createLiveAgentStudioRouter,
  readLiveAgentResult,
  saveLiveAgentResult,
} from './liveAgent.js';

describe('live agent session', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it('returns a schema the agent posted and rejects a connection string in the comment', () => {
    const session = createLiveAgentSession();
    expect(() =>
      saveLiveAgentResult(session.token, {
        model: { source: 'ddl:mongodb-json', tables: [], relationships: [] },
        ddl: '// mongodb://user:secret@localhost/shop\n',
        dialect: 'mongodb-json',
      }),
    ).toThrow(/connection string/);
    saveLiveAgentResult(session.token, {
      model: {
        source: 'ddl:mongodb-json',
        tables: [{ name: 'users', columns: [], primaryKey: ['_id'], foreignKeys: [], rowCount: 1 }],
        relationships: [],
      },
      ddl: '// Live MongoDB database shop. Schema inferred from a sample of documents.\n',
      dialect: 'mongodb-json',
    });
    expect(readLiveAgentResult(session.token)?.result?.dialect).toBe('mongodb-json');
  });

  it('lets an agent answer an introspect request without sending the URI', async () => {
    const session = createLiveAgentSession();
    const app = express();
    app.use(express.json());
    app.use('/api/agent', createLiveAgentPublicRouter());
    app.use('/api/schema', createLiveAgentStudioRouter());
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server has no port');

    await runLiveAgent({
      token: session.token,
      uri: 'mongodb://user:secret@localhost:27017/shop',
      server: `http://127.0.0.1:${address.port}`,
      timeoutMs: 2_000,
      introspect: async () => ({
        model: { source: 'ddl:mongodb-json', tables: [], relationships: [] },
        ddl: '// Live MongoDB database shop. Schema inferred from a sample of documents.\n',
        dialect: 'mongodb-json',
      }),
    });

    const result = await fetch(`http://127.0.0.1:${address.port}/api/schema/agent-result?token=${session.token}`);
    const body = (await result.json()) as { dialect?: string; ddl?: string };
    expect(result.status).toBe(200);
    expect(body.dialect).toBe('mongodb-json');
    expect(body.ddl ?? '').not.toContain('secret');
  });
});
