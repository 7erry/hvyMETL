import { afterEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import * as mongoMcpClient from './mongoMcpClient.js';
import { invokeMongoInspectTool } from './mongoInspectService.js';

function mockInspectMcp(
  handler: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown,
): ReturnType<typeof vi.fn> {
  const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const result = await handler(name, args);
    if (result !== undefined) return result;
    if (name === 'connect') {
      return { connectionId: 'preconfigured' };
    }
    if (name === 'disconnect') {
      return { outcome: 'removed' };
    }
    if (name === 'count') return { count: 0 };
    if (name === 'collection-storage-size') return { size: 0, units: 'bytes' };
    if (name === 'collection-indexes') return { classicIndexesCount: 1, searchIndexesCount: 0 };
    throw new Error(`Unexpected tool ${name}`);
  });
  vi.spyOn(mongoMcpClient, 'withMongoMcpSession').mockImplementation(async (fn) => fn(callTool));
  return callTool;
}

describe('mongoInspectService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('returns a friendly unavailable message when MCP is disabled', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(false);
    const result = await invokeMongoInspectTool({} as import('express').Request, 'listMongoDatabases', {});
    expect(result.ok).toBe(false);
    expect(result.serviceUnavailable).toBe(true);
    expect(result.summary).toMatch(/not currently available/i);
  });

  it('maps logical database names to physical names before calling MCP', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    const callTool = mockInspectMcp(async (name) => {
      if (name === 'list-databases') {
        return { databases: [{ name: 'csv_to_atlas', size: 1 }], totalCount: 1 };
      }
      return {
        collections: [{ name: 'stations' }],
        totalCount: 1,
      };
    });

    const req = { auth: undefined } as import('express').Request;
    const result = await invokeMongoInspectTool(req, 'listMongoCollections', {
      database: 'csv_to_atlas',
    });

    expect(result.ok).toBe(true);
    expect(callTool).toHaveBeenCalledWith('list-collections', {
      connectionId: 'preconfigured',
      database: 'csv_to_atlas',
    });
    expect((result.data as { database: string }).database).toBe('csv_to_atlas');
    vi.restoreAllMocks();
  });

  it('lists tenant databases from MCP structuredContent and strips prefixes', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name) => {
      if (name === 'list-databases') {
        return {
          databases: [{ name: 'terry_walters__mytrains', size: 100 }],
          totalCount: 1,
        };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoDatabases', {});
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Found 1 database: mytrains.');
    expect(result.data).toEqual({
      databases: [{ name: 'mytrains', size: 100 }],
      totalCount: 1,
    });
    vi.restoreAllMocks();
  });

  it('lists collections from the discovered logical database when database arg is omitted', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [
            { name: 'terry_walters__csv_to_atlas', size: 1 },
            { name: 'terry_walters__mytrains', size: 500 },
          ],
          totalCount: 2,
        };
      }
      if (name === 'list-collections') {
        expect(args).toEqual({ connectionId: 'preconfigured', database: 'terry_walters__mytrains' });
        return {
          collections: [{ name: 'stations' }, { name: 'trains' }],
          totalCount: 2,
        };
      }
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoCollections', {});
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Listed 2 collection(s) in mytrains.');
    expect(result.data).toEqual({
      database: 'mytrains',
      collections: [
        { name: 'stations', documentCount: 0, storageSize: 0, storageSizeUnits: 'bytes', indexCount: 1 },
        { name: 'trains', documentCount: 0, storageSize: 0, storageSizeUnits: 'bytes', indexCount: 1 },
      ],
      totalCount: 2,
    });
    vi.restoreAllMocks();
  });

  it('lists mytrains from terry_walters__mytrains when JWT only has sub hash prefix', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name) => {
      if (name === 'list-databases') {
        return {
          databases: [
            { name: 'u_c5d09a77__railway_ops', size: 1 },
            { name: 'terry_walters__mytrains', size: 900 },
          ],
          totalCount: 2,
        };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoDatabases', {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      databases: [{ name: 'mytrains', size: 900 }],
      totalCount: 1,
    });
    vi.restoreAllMocks();
  });

  it('lists collections from terry_walters__mytrains when logical mytrains is requested', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [
            { name: 'u_c5d09a77__railway_ops', size: 1 },
            { name: 'terry_walters__mytrains', size: 900 },
          ],
          totalCount: 2,
        };
      }
      if (name === 'count') {
        const collection = (args as { collection?: string }).collection;
        return { count: collection === 'routes' ? 120 : collection === 'stations' ? 45 : 12 };
      }
      if (name === 'collection-storage-size') return { size: 1.5, units: 'MB' };
      if (name === 'collection-indexes') return { classicIndexesCount: 2, searchIndexesCount: 0 };
      expect(args).toEqual({ connectionId: 'preconfigured', database: 'terry_walters__mytrains' });
      return {
        collections: [{ name: 'routes' }, { name: 'stations' }, { name: 'trains' }],
        totalCount: 3,
      };
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoCollections', { database: 'mytrains' });
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Listed 3 collection(s) in mytrains.');
    expect(result.data).toEqual({
      database: 'mytrains',
      collections: [
        { name: 'routes', documentCount: 120, storageSize: 1.5, storageSizeUnits: 'MB', indexCount: 2 },
        { name: 'stations', documentCount: 45, storageSize: 1.5, storageSizeUnits: 'MB', indexCount: 2 },
        { name: 'trains', documentCount: 12, storageSize: 1.5, storageSizeUnits: 'MB', indexCount: 2 },
      ],
      totalCount: 3,
    });
    vi.restoreAllMocks();
  });

  it('lists collections for large databases without opening a connection per stat call', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    const collectionNames = Array.from({ length: 19 }, (_, index) => ({ name: `collection_${index + 1}` }));
    const callTool = mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [{ name: 'terry_walters__fromoraclewithlove', size: 900 }],
          totalCount: 1,
        };
      }
      if (name === 'list-collections') {
        expect(args).toEqual({ connectionId: 'preconfigured', database: 'terry_walters__fromoraclewithlove' });
        return { collections: collectionNames, totalCount: collectionNames.length };
      }
      return {};
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoCollections', {
      database: 'fromoraclewithlove',
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Listed 19 collection(s) in fromoraclewithlove.');
    expect((result.data as { collections: unknown[] }).collections).toHaveLength(19);
    expect(mongoMcpClient.withMongoMcpSession).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls.length).toBeGreaterThan(19);
    vi.restoreAllMocks();
  });

  it('runs aggregate analyze tool through MCP', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    const callTool = mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return { databases: [{ name: 'terry_walters__myshop', size: 100 }], totalCount: 1 };
      }
      if (name === 'aggregate') {
        expect(args).toMatchObject({
          connectionId: 'preconfigured',
          database: 'terry_walters__myshop',
          collection: 'orders',
        });
        return { documents: [{ _id: 'open', total: 3 }], count: 1, appliedLimits: [] };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'aggregateMongoCollection', {
      database: 'myshop',
      collection: 'orders',
      pipeline: [{ $group: { _id: '$status', total: { $sum: 1 } } }],
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Aggregation returned');
    expect((result.data as { documents: unknown[] }).documents).toHaveLength(1);
    expect(callTool).toHaveBeenCalled();
  });

  it('compares a live collection against plan context', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name) => {
      if (name === 'list-databases') {
        return { databases: [{ name: 'terry_walters__myshop', size: 100 }], totalCount: 1 };
      }
      if (name === 'collection-schema') {
        return { schema: { properties: { status: { bsonType: 'string' } } }, fieldsCount: 1 };
      }
      if (name === 'collection-indexes') {
        return { classicIndexes: [{ name: 'status_1', key: { status: 1 } }], classicIndexesCount: 1 };
      }
      if (name === 'count') return { count: 4 };
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(
      req,
      'compareMongoCollectionToPlan',
      { database: 'myshop', collection: 'orders' },
      {
        planContext: {
          collections: [
            {
              name: 'orders',
              sourceTable: 'orders',
              topLevelFields: ['status', 'customerId'],
              embeddedFields: [],
              indexKeys: ['status:1'],
            },
          ],
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Compared orders');
    expect((result.data as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
  });

  it('dials MCP connect with MONGODB_URI instead of relying on preconfigured', async () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.example.net/';
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    const callTool = mockInspectMcp(async (name, args) => {
      if (name === 'connect') {
        return { connectionId: 'hvymetl-session' };
      }
      if (name === 'disconnect') return { outcome: 'removed' };
      if (name === 'list-databases') {
        expect(args).toEqual({ connectionId: 'hvymetl-session' });
        return { databases: [{ name: 'mytrains', size: 1 }], totalCount: 1 };
      }
      throw new Error(`Unexpected tool ${name}`);
    });

    const req = { auth: undefined, headers: {} } as import('express').Request;
    const result = await invokeMongoInspectTool(req, 'listMongoDatabases', {});
    expect(result.ok).toBe(true);
    expect(callTool).toHaveBeenCalledWith('connect', {
      connectionString: 'mongodb+srv://user:pass@cluster.example.net/',
      connectionName: 'hvymetl',
    });
    expect(callTool).toHaveBeenCalledWith('disconnect', { connectionId: 'hvymetl-session' });
    delete process.env.MONGODB_URI;
  });

  it('sanitizes collection indexes for the copilot UI', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [{ name: 'terry_walters__fromoraclewithlove', size: 900 }],
          totalCount: 1,
        };
      }
      if (name === 'collection-indexes') {
        expect(args).toEqual({
          connectionId: 'preconfigured',
          database: 'terry_walters__fromoraclewithlove',
          collection: 'salesChannels',
        });
        return {
          classicIndexes: [
            { name: '_id_', key: { _id: 1 } },
            { name: 'code_1', key: { code: 1 } },
          ],
          searchIndexes: [{ name: 'search_idx', type: 'search', status: 'READY', queryable: true, latestDefinition: {} }],
          classicIndexesCount: 2,
          searchIndexesCount: 1,
        };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'listMongoCollectionIndexes', {
      database: 'fromoraclewithlove',
      collection: 'salesChannels',
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Listed 3 indexes for salesChannels in fromoraclewithlove.');
    expect(result.data).toEqual({
      database: 'fromoraclewithlove',
      collection: 'salesChannels',
      classicIndexes: [
        { name: '_id_', key: { _id: 1 } },
        { name: 'code_1', key: { code: 1 } },
      ],
      searchIndexes: [{ name: 'search_idx', type: 'search', status: 'READY', queryable: true }],
      totalCount: 3,
    });
  });

  it('resolves the database for explain when collection exists in one tenant database', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [
            { name: 'terry_walters__fromoraclewithlove', size: 900 },
            { name: 'terry_walters__mytrains', size: 500 },
            { name: 'terry_walters__moretrains', size: 400 },
          ],
          totalCount: 3,
        };
      }
      if (name === 'list-collections') {
        const database = (args as { database?: string }).database;
        if (database === 'terry_walters__fromoraclewithlove') {
          return { collections: [{ name: 'orders' }], totalCount: 1 };
        }
        if (database === 'terry_walters__mytrains') {
          return { collections: [{ name: 'trains' }, { name: 'routes' }], totalCount: 2 };
        }
        if (database === 'terry_walters__moretrains') {
          return { collections: [{ name: 'stations' }], totalCount: 1 };
        }
        return { collections: [], totalCount: 0 };
      }
      if (name === 'explain') {
        expect(args).toMatchObject({
          connectionId: 'preconfigured',
          database: 'terry_walters__mytrains',
          collection: 'trains',
        });
        return {
          winningPlan: { stage: 'IXSCAN', indexName: 'status_1' },
          executionStats: { totalDocsExamined: 12, nReturned: 12, executionTimeMillis: 3 },
        };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'explainMongoOperation', {
      collection: 'trains',
      method: 'find',
      filter: { status: 'active' },
      verbosity: 'executionStats',
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('trains');
    expect(result.summary).toContain('mytrains');
  });

  it('requires database when the same collection exists in multiple tenant databases', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name, args) => {
      if (name === 'list-databases') {
        return {
          databases: [
            { name: 'terry_walters__mytrains', size: 500 },
            { name: 'terry_walters__moretrains', size: 400 },
          ],
          totalCount: 2,
        };
      }
      if (name === 'list-collections') {
        return { collections: [{ name: 'trains' }, { name: 'routes' }], totalCount: 2 };
      }
      throw new Error(`Unexpected tool ${name}`);
    });
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as import('express').Request;

    const result = await invokeMongoInspectTool(req, 'explainMongoOperation', {
      collection: 'trains',
      method: 'find',
      filter: { status: 'active' },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/multiple databases/i);
    expect(result.error).toMatch(/mytrains/);
    expect(result.error).toMatch(/moretrains/);
  });
});
