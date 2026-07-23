import { describe, expect, it } from 'vitest';
import {
  extractNamedDatabaseForListCollectionsRequest,
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
