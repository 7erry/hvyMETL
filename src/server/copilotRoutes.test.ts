import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCopilotRouter } from './copilotRoutes.js';

describe('copilot routes', () => {
  const originalEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
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

  it('returns configured status', async () => {
    const { status, body } = await getJson('/api/copilot/status');
    expect(status).toBe(200);
    expect(body.configured).toBe(true);
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
