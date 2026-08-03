import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSizingAssistantRouter } from '../routes/sizingAssistantRoute.js';
import { InMemorySizingSessionStore, setSizingSessionStore } from '../copilot/sizingAssistantSession.js';

describe('sizing assistant routes', () => {
  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
    setSizingSessionStore(new InMemorySizingSessionStore());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function postJson(path: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/sizing-assistant', createSizingAssistantRouter());
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

  it('creates session and executes find_optimal_cluster_tier via tools route', async () => {
    const createApp = express();
    createApp.use(express.json());
    createApp.use('/api/sizing-assistant', createSizingAssistantRouter());
    const server = createApp.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/sizing-assistant/session`, {
      method: 'POST',
    });
    const created = (await createResponse.json()) as { sessionId: string };
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    const sessionId = created.sessionId;
    await postJson('/api/sizing-assistant/tools', {
      sessionId,
      tool: 'update_sizing_parameters',
      args: {
        projected_total_data_size_gb: 250,
        total_raw_read_ops: 3000,
        total_raw_write_ops: 900,
        avg_doc_size_kb: 2,
      },
    });

    const { status, body } = await postJson('/api/sizing-assistant/tools', {
      sessionId,
      tool: 'find_optimal_cluster_tier',
      args: {},
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const data = body.data as { recommendations: Array<{ tierId: string }> };
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/finalHourlyCost/);
  });
});
