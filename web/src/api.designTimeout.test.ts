import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDesignWithCsv, type DesignRequest } from './api';

describe('runDesignWithCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the design timeout signal', async () => {
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const request: DesignRequest = {
      profileId: 'catalog',
      model: { tables: [], relationships: [], source: 'ddl:ansi' },
      ddl: 'CREATE TABLE t (id INT);',
    };
    await runDesignWithCsv([new File(['a'], 'a.csv', { type: 'text/csv' })], request);

    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
