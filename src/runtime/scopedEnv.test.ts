import { describe, expect, it } from 'vitest';
import { readMongoDbModelKeyFromEnv } from '../rag/voyage.js';
import { readScopedEnv, runInScopedEnv } from '../runtime/scopedEnv.js';

describe('scopedEnv', () => {
  it('prefers scoped values over process.env for model key reads', async () => {
    const previous = process.env.MONGODB_MODEL_KEY;
    process.env.MONGODB_MODEL_KEY = 'global-key';

    await runInScopedEnv({ MONGODB_MODEL_KEY: 'scoped-key' }, async () => {
      expect(readScopedEnv('MONGODB_MODEL_KEY')).toBe('scoped-key');
      expect(readMongoDbModelKeyFromEnv()).toBe('scoped-key');
    });

    expect(readMongoDbModelKeyFromEnv()).toBe('global-key');

    if (previous === undefined) delete process.env.MONGODB_MODEL_KEY;
    else process.env.MONGODB_MODEL_KEY = previous;
  });
});
