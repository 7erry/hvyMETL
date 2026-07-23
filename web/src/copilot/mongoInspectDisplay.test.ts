import { describe, expect, it } from 'vitest';
import { buildMongoInspectDelta, serializeMongoInspectToolResult } from './mongoInspectDisplay.js';

describe('mongoInspectDisplay', () => {
  it('includes database names in the LLM tool payload', () => {
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
      data: { databases: [{ name: 'mytrains' }], totalCount: 1 },
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
        summary: 'Listed 3 collection(s) in mytrains: routes, stations, trains.',
        data: {
          database: 'mytrains',
          collections: [{ name: 'routes' }, { name: 'stations' }, { name: 'trains' }],
          totalCount: 3,
        },
      }),
    ).toEqual(['mytrains.routes', 'mytrains.stations', 'mytrains.trains']);
  });
});
