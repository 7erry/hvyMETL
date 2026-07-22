import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCopilotRouter } from './copilotRoutes.js';
import * as mongoInspectService from '../copilot/mongoInspectService.js';
import * as mongoMcpClient from '../copilot/mongoMcpClient.js';

describe('copilot routes', () => {
  const originalEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    vi.spyOn(mongoMcpClient, 'probeMongoMcpAvailability').mockResolvedValue({ available: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('chat/completions')) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return realFetch(input, init);
      }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function postJson(path: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/copilot', createCopilotRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/copilot', createCopilotRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  it('returns configured status with mongo inspect probe', async () => {
    const { status, body } = await getJson('/api/copilot/status');
    expect(status).toBe(200);
    expect(body.configured).toBe(true);
    expect((body.mongoInspect as { available: boolean }).available).toBe(true);
  });

  it('invokes mongo inspect tools via API', async () => {
    vi.spyOn(mongoInspectService, 'invokeMongoInspectTool').mockResolvedValue({
      ok: true,
      tool: 'listMongoDatabases',
      summary: 'Found 1 database.',
      data: { databases: [{ name: 'csv_to_atlas' }], totalCount: 1 },
    });

    const { status, body } = await postJson('/api/copilot/mongo/inspect', {
      tool: 'listMongoDatabases',
      args: {},
    });
    expect(status).toBe(200);
    expect(body.summary).toBe('Found 1 database.');
  });

  it('proxies chat to Grove', async () => {
    const { status, body } = await postJson('/api/copilot/chat', {
      messages: [{ role: 'user', content: 'Hello' }],
      schemaContext: {
        tables: [],
        relationships: [],
        guardrailIssues: [],
        cardinalityOverrides: {},
        forceEmbedOverrides: {},
      },
    });
    expect(status).toBe(200);
    expect((body.message as { content: string }).content).toBe('OK');
  });
});
