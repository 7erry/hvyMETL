import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createCopilotRouter } from './copilotRoutes.js';
import * as mongoAtlasSearchIndexService from '../copilot/mongoAtlasSearchIndexService.js';
import * as mongoMcpClient from '../copilot/mongoMcpClient.js';

describe('copilot atlas-search-index route', () => {
  beforeEach(() => {
    process.env.GROVE_API_KEY = 'test-key';
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function postAtlasSearchIndex(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/copilot', createCopilotRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/copilot/mongo/atlas-search-index`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body };
  }

  it('returns created lexical search index summary on success', async () => {
    vi.spyOn(mongoAtlasSearchIndexService, 'createMongoAtlasSearchIndex').mockResolvedValue({
      ok: true,
      summary: 'Created MongoDB Search (keyword) index "search_keyword_title_description" on csv_to_atlas.products.',
      database: 'csv_to_atlas',
      collection: 'products',
      indexName: 'search_keyword_title_description',
      pattern: 'keyword',
    });

    const { status, body } = await postAtlasSearchIndex({
      database: 'csv_to_atlas',
      collection: 'products',
      pattern: 'keyword',
      textPaths: ['title', 'description'],
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.indexName).toBe('search_keyword_title_description');
    expect(body.pattern).toBe('keyword');
  });

  it('returns 400 for validation errors', async () => {
    vi.spyOn(mongoAtlasSearchIndexService, 'createMongoAtlasSearchIndex').mockResolvedValue({
      ok: false,
      summary: 'pattern is required.',
      error: 'pattern is required.',
    });

    const { status, body } = await postAtlasSearchIndex({ database: 'db', collection: 'c' });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
