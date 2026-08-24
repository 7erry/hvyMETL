import { describe, expect, it } from 'vitest';
import {
  defaultClassicIndexName,
  parseDirectClassicIndexCommand,
  parseMongoClassicIndexInput,
  parseMongoShellIndexKeys,
} from './mongoClassicIndex.js';

describe('parseMongoShellIndexKeys', () => {
  it('parses simple ascending keys', () => {
    expect(parseMongoShellIndexKeys('{ status: 1 }')).toEqual({ status: 1 });
  });

  it('parses compound keys', () => {
    expect(parseMongoShellIndexKeys('{ customerId: 1, createdAt: -1 }')).toEqual({
      customerId: 1,
      createdAt: -1,
    });
  });
});

describe('parseDirectClassicIndexCommand', () => {
  it('parses db.collection.createIndex shell syntax', () => {
    expect(parseDirectClassicIndexCommand('db.journalEntries.createIndex({ status: 1 })')).toEqual({
      collection: 'journalEntries',
      keys: { status: 1 },
    });
  });

  it('parses prefixed create-this-index prompts', () => {
    expect(
      parseDirectClassicIndexCommand(
        'can you create this index: db.journalEntries.createIndex({ status: 1 })',
      ),
    ).toEqual({
      collection: 'journalEntries',
      keys: { status: 1 },
    });
  });

  it('parses use database prefix', () => {
    expect(
      parseDirectClassicIndexCommand('use csv_to_atlas\ndb.journalEntries.createIndex({ status: 1 })'),
    ).toEqual({
      database: 'csv_to_atlas',
      collection: 'journalEntries',
      keys: { status: 1 },
    });
  });

  it('parses natural language with db.collection target', () => {
    expect(
      parseDirectClassicIndexCommand('create index on csv_to_atlas.journalEntries { status: 1 }'),
    ).toEqual({
      database: 'csv_to_atlas',
      collection: 'journalEntries',
      keys: { status: 1 },
    });
  });
});

describe('parseMongoClassicIndexInput', () => {
  it('validates API input', () => {
    expect(
      parseMongoClassicIndexInput({
        database: 'csv_to_atlas',
        collection: 'journalEntries',
        keys: { status: 1 },
      }),
    ).toEqual({
      database: 'csv_to_atlas',
      collection: 'journalEntries',
      keys: { status: 1 },
      options: undefined,
    });
  });
});

describe('defaultClassicIndexName', () => {
  it('builds MongoDB default index names', () => {
    expect(defaultClassicIndexName({ status: 1 })).toBe('status_1');
    expect(defaultClassicIndexName({ customerId: 1, createdAt: -1 })).toBe('customerId_1_createdAt_-1');
  });
});
