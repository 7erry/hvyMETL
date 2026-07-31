import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createCopilotRouter } from './copilotRoutes.js';
import * as mongoVectorIndexService from '../copilot/mongoVectorIndexService.js';
import * as mongoMcpClient from '../copilot/mongoMcpClient.js';

describe('copilot vector-index route', () => {
  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function postVectorIndex(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/copilot', createCopilotRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/copilot/mongo/vector-index`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  it('returns created index summary on success', async () => {
    vi.spyOn(mongoVectorIndexService, 'createMongoAutoEmbedVectorIndex').mockResolvedValue({
      ok: true,
      summary: 'Created autoEmbed vector index "autoEmbed_body_voyage-4-lite" on csv_to_atlas.products (field body).',
      database: 'csv_to_atlas',
      collection: 'products',
      indexName: 'autoEmbed_body_voyage-4-lite',
    });

    const { status, body } = await postVectorIndex({
      database: 'csv_to_atlas',
      collection: 'products',
      path: 'body',
      model: 'voyage-4-lite',
      quantization: 'scalar',
      numDimensions: 1024,
      similarity: 'cosine',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.indexName).toBe('autoEmbed_body_voyage-4-lite');
  });

  it('returns 400 for validation errors', async () => {
    vi.spyOn(mongoVectorIndexService, 'createMongoAutoEmbedVectorIndex').mockResolvedValue({
      ok: false,
      summary: 'path is required.',
      error: 'path is required.',
    });

    const { status, body } = await postVectorIndex({ database: 'db', collection: 'c' });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
