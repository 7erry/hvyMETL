import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyExtractChunk, createExtractJob, markExtractComplete } from './agentExtractStaging.js';

describe('agent extract staging', () => {
  it('appends CSV rows and skips duplicate checkpoints', () => {
    const stagingDir = mkdtempSync(join(tmpdir(), 'hvymetl-extract-'));
    const job = createExtractJob(stagingDir, 100);
    job.tables = [{ name: 'users', columns: ['id', 'name'], checkpoint: null, rowsReceived: 0, eof: false }];

    const first = applyExtractChunk({
      job,
      table: 'users',
      checkpoint: '1',
      columns: ['id', 'name'],
      rows: [
        [1, 'Ada'],
        [2, 'Grace'],
      ],
      eof: false,
    });
    expect(first.applied).toBe(true);
    expect(first.table.rowsReceived).toBe(2);

    const dup = applyExtractChunk({
      job,
      table: 'users',
      checkpoint: '1',
      columns: ['id', 'name'],
      rows: [[1, 'Ada']],
      eof: false,
    });
    expect(dup.applied).toBe(false);
    expect(dup.table.rowsReceived).toBe(2);

    applyExtractChunk({
      job,
      table: 'users',
      checkpoint: '2',
      columns: ['id', 'name'],
      rows: [[3, 'Alan']],
      eof: true,
    });
    markExtractComplete(job);
    expect(job.status).toBe('complete');
    const csv = readFileSync(join(stagingDir, 'users.csv'), 'utf8');
    expect(csv).toBe('id,name\n1,Ada\n2,Grace\n3,Alan\n');
  });
});
