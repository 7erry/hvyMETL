import { describe, expect, it } from 'vitest';
import { buildMongoInspectDelta, serializeMongoInspectToolResult } from './mongoInspectDisplay.js';

describe('mongoInspectDisplay', () => {
  it('omits full listing payloads from the LLM tool result when the UI renders a table', () => {
    const payload = serializeMongoInspectToolResult({
      ok: true,
      tool: 'listMongoDatabases',
      summary: 'Found 1 database: mytrains.',
      data: { databases: [{ name: 'mytrains' }], totalCount: 1 },
    });
    expect(JSON.parse(payload)).toEqual({
      ok: true,
      tool: 'listMongoDatabases',
      summary: 'Found 1 database: mytrains.',
      uiRendered: true,
    });
  });

  it('builds delta lines for listed databases and collections', () => {
    expect(
      buildMongoInspectDelta('listMongoDatabases', {
        ok: true,
        tool: 'listMongoDatabases',
        summary: 'Found 1 database: mytrains.',
        data: { databases: [{ name: 'mytrains' }], totalCount: 1 },
      }),
    ).toEqual(['database: mytrains']);

    expect(
      buildMongoInspectDelta('listMongoCollections', {
        ok: true,
        tool: 'listMongoCollections',
        summary: 'Listed 3 collection(s) in mytrains.',
        data: {
          database: 'mytrains',
          collections: [{ name: 'routes' }, { name: 'stations' }, { name: 'trains' }],
          totalCount: 3,
        },
      }),
    ).toEqual(['mytrains.routes', 'mytrains.stations', 'mytrains.trains']);

    expect(
      buildMongoInspectDelta('listMongoCollectionIndexes', {
        ok: true,
        tool: 'listMongoCollectionIndexes',
        summary: 'Listed 2 indexes for salesChannels in fromoraclewithlove.',
        data: {
          database: 'fromoraclewithlove',
          collection: 'salesChannels',
          classicIndexes: [{ name: '_id_', key: { _id: 1 } }, { name: 'code_1', key: { code: 1 } }],
          searchIndexes: [],
          totalCount: 2,
        },
      }),
    ).toEqual([
      'fromoraclewithlove.salesChannels classic _id_',
      'fromoraclewithlove.salesChannels classic code_1',
    ]);

    expect(
      buildMongoInspectDelta('describeMongoCollectionSchema', {
        ok: true,
        tool: 'describeMongoCollectionSchema',
        summary: 'Inferred schema for sensors in csv_to_atlas.',
        data: {
          database: 'csv_to_atlas',
          collection: 'sensors',
          fieldsCount: 2,
          fields: [
            { path: 'status', types: 'string' },
            { path: 'value', types: 'double' },
          ],
        },
      }),
    ).toEqual([
      'csv_to_atlas.sensors status: string',
      'csv_to_atlas.sensors value: double',
    ]);
  });

  it('omits schema payloads from the LLM tool result when the UI renders a table', () => {
    const payload = serializeMongoInspectToolResult({
      ok: true,
      tool: 'describeMongoCollectionSchema',
      summary: 'Inferred schema for sensors in csv_to_atlas.',
      data: {
        database: 'csv_to_atlas',
        collection: 'sensors',
        fieldsCount: 1,
        fields: [{ path: 'status', types: 'string' }],
      },
    });
    expect(JSON.parse(payload)).toEqual({
      ok: true,
      tool: 'describeMongoCollectionSchema',
      summary: 'Inferred schema for sensors in csv_to_atlas.',
      uiRendered: true,
    });
  });
});
