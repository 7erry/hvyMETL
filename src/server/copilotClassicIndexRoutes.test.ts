import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createCopilotRouter } from './copilotRoutes.js';
import * as mongoClassicIndexService from '../copilot/mongoClassicIndexService.js';
import * as mongoMcpClient from '../copilot/mongoMcpClient.js';

describe('copilot classic-index route', () => {
  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function postClassicIndex(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/copilot', createCopilotRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/copilot/mongo/classic-index`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  it('returns created index summary on success', async () => {
    vi.spyOn(mongoClassicIndexService, 'createMongoClassicIndex').mockResolvedValue({
      ok: true,
      summary: 'Created classic index "status_1" on csv_to_atlas.journalEntries ({ status: 1 }).',
      database: 'csv_to_atlas',
      collection: 'journalEntries',
      indexName: 'status_1',
      keys: { status: 1 },
    });

    const { status, body } = await postClassicIndex({
      database: 'csv_to_atlas',
      collection: 'journalEntries',
      keys: { status: 1 },
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.indexName).toBe('status_1');
  });
});
