import { describe, expect, it } from 'vitest';
import { MONGO_SHELL_SNIPPETS } from './mongoShellSnippets';

describe('MONGO_SHELL_SNIPPETS', () => {
  it('lists each diagnostic script once', () => {
    const ids = MONGO_SHELL_SNIPPETS.map((snippet) => snippet.id);
    expect(ids).toEqual([
      'prompt',
      'slow-ops',
      'unused-indexes',
      'storage-report',
      'schema-inspector',
      'batched-delete',
      'replication-lag',
    ]);
    expect(new Set(MONGO_SHELL_SNIPPETS.map((snippet) => snippet.label)).size).toBe(ids.length);
  });

  it('leaves kill and delete examples commented', () => {
    const slow = MONGO_SHELL_SNIPPETS.find((snippet) => snippet.id === 'slow-ops');
    const batched = MONGO_SHELL_SNIPPETS.find((snippet) => snippet.id === 'batched-delete');
    expect(slow?.script).toMatch(/\/\/ db\.killOp\(123456\);/);
    expect(slow?.script).not.toMatch(/^\s*db\.killOp\(/m);
    expect(batched?.script).toMatch(/\/\/ batchedDelete\(/);
    expect(batched?.script).not.toMatch(/^\s*batchedDelete\(/m);
    const prompt = MONGO_SHELL_SNIPPETS.find((snippet) => snippet.id === 'prompt');
    expect(prompt?.script).toContain('return `[${role}] ${db.getName()}> `;');
  });
});
