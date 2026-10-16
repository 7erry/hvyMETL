import { describe, expect, it } from 'vitest';
import { assertLivePipelineAllowed, rowsToCsv } from './livePipelineSource.js';

describe('live pipeline source', () => {
  it('writes a CSV the existing loader can read', () => {
    expect(rowsToCsv(['id', 'note'], [[1, 'hello, "world"'], [2, null]])).toBe(
      'id,note\n1,"hello, ""world"""\n2,\n',
    );
  });

  it('refuses a hosted studio before opening a connection', () => {
    expect(() => assertLivePipelineAllowed(true)).toThrow(/hosted studio/);
    expect(() => assertLivePipelineAllowed(false)).not.toThrow();
  });
});
