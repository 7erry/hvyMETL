import { describe, expect, it } from 'vitest';
import { parseDirectClassicIndexCommand } from './classicIndexCommandRouting';

describe('classicIndexCommandRouting', () => {
  it('routes shell createIndex commands', () => {
    expect(parseDirectClassicIndexCommand('db.journalEntries.createIndex({ status: 1 })')).toEqual({
      collection: 'journalEntries',
      keys: { status: 1 },
    });
  });
});
