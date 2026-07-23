import { describe, expect, it } from 'vitest';
import {
  extractNamedDatabaseForListCollectionsRequest,
  isInspectOnlyUserMessage,
  looksLikeInspectListingEcho,
  parseDirectMongoInspectCommand,
  shouldSuppressListMongoDatabasesDisplay,
} from './inspectCommandRouting';
import type { ParsedCopilotToolCall } from './llmTools';

describe('inspectCommandRouting', () => {
  it('extracts database names from list-collections phrasing', () => {
    expect(extractNamedDatabaseForListCollectionsRequest('list collections from fromoraclewithlove')).toBe(
      'fromoraclewithlove',
    );
    expect(extractNamedDatabaseForListCollectionsRequest('List collections in csv_to_atlas')).toBe('csv_to_atlas');
    expect(extractNamedDatabaseForListCollectionsRequest('what collections are in mytrains')).toBe('mytrains');
  });

  it('routes list-collections commands directly to listMongoCollections', () => {
    expect(parseDirectMongoInspectCommand('list collections from fromoraclewithlove')).toEqual({
      kind: 'mongoInspect',
      tool: 'listMongoCollections',
      args: { database: 'fromoraclewithlove' },
    });
  });

  it('routes list-databases commands directly to listMongoDatabases', () => {
    expect(parseDirectMongoInspectCommand('list databases')).toEqual({
      kind: 'mongoInspect',
      tool: 'listMongoDatabases',
      args: {},
    });
    expect(parseDirectMongoInspectCommand('show me databases')).toEqual({
      kind: 'mongoInspect',
      tool: 'listMongoDatabases',
      args: {},
    });
  });

  it('detects inspect-only list requests', () => {
    expect(isInspectOnlyUserMessage('show me databases')).toBe(true);
    expect(isInspectOnlyUserMessage('list collections from fromoraclewithlove')).toBe(true);
    expect(isInspectOnlyUserMessage('show me databases and recommend one for analytics')).toBe(false);
  });

  it('detects assistant listing echoes', () => {
    expect(looksLikeInspectListingEcho('## Available MongoDB Databases\n\n| Database | Size |')).toBe(true);
    expect(looksLikeInspectListingEcho('Use fromoraclewithlove for the Oracle import.')).toBe(false);
  });

  it('suppresses redundant listMongoDatabases when the user named a database', () => {
    expect(
      shouldSuppressListMongoDatabasesDisplay('list collections from fromoraclewithlove', []),
    ).toBe(true);
  });

  it('suppresses listMongoDatabases when listMongoCollections is in the same LLM batch', () => {
    const batch: ParsedCopilotToolCall[] = [
      { kind: 'mongoInspect', tool: 'listMongoDatabases', args: {} },
      { kind: 'mongoInspect', tool: 'listMongoCollections', args: { database: 'fromoraclewithlove' } },
    ];
    expect(shouldSuppressListMongoDatabasesDisplay('show me what is in Atlas', batch)).toBe(true);
  });
});
