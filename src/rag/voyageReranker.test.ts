import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOYAGE_RERANK_MODEL, voyageRerank } from './voyageReranker.js';

describe('voyageRerank', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MONGODB_MODEL_KEY;
  });

  it('calls POST /rerank with rerank-2.5 when MONGODB_MODEL_KEY is set', async () => {
    process.env.MONGODB_MODEL_KEY = 'al-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, relevance_score: 0.91 },
          { index: 0, relevance_score: 0.42 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const scores = await voyageRerank('read-heavy workload', ['embed pattern', 'bucket pattern'], {
      topK: 2,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai.mongodb.com/v1/rerank');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(DEFAULT_VOYAGE_RERANK_MODEL);
    expect(body.query).toBe('read-heavy workload');
    expect(body.documents).toEqual(['embed pattern', 'bucket pattern']);
    expect(body.top_k).toBe(2);
    expect(scores[0]).toEqual({ index: 1, relevanceScore: 0.91 });
  });

  it('throws when no API key is configured', async () => {
    await expect(voyageRerank('query', ['doc'])).rejects.toThrow(/MONGODB_MODEL_KEY/);
  });
});
