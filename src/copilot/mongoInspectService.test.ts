import { describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import * as mongoMcpClient from './mongoMcpClient.js';
import { invokeMongoInspectTool } from './mongoInspectService.js';

function mockInspectMcp(
  handler: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown,
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockImplementation(async (name, args) => {
    if (name === 'count') return { count: 0 };
    if (name === 'collection-storage-size') return { size: 0, units: 'bytes' };
    if (name === 'collection-indexes') return { classicIndexesCount: 1, searchIndexesCount: 0 };
    return handler(name, args as Record<string, unknown>);
  });
}

describe('mongoInspectService', () => {
  it('returns a friendly unavailable message when MCP is disabled', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(false);
    const result = await invokeMongoInspectTool({} as import('express').Request, 'listMongoDatabases', {});
    expect(result.ok).toBe(false);
    expect(result.serviceUnavailable).toBe(true);
    expect(result.summary).toMatch(/not currently available/i);
    vi.restoreAllMocks();
  });

  it('maps logical database names to physical names before calling MCP', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    mockInspectMcp(async (name) => {
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
    expect(mongoMcpClient.callMongoMcpTool).toHaveBeenCalledWith('list-collections', {
      connectionId: 'preconfigured',
      database: 'csv_to_atlas',
    });
    expect((result.data as { database: string }).database).toBe('csv_to_atlas');
    vi.restoreAllMocks();
  });

  it('lists tenant databases from MCP structuredContent and strips prefixes', async () => {
    vi.spyOn(mongoMcpClient, 'isMongoMcpEnabled').mockReturnValue(true);
    vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockResolvedValue({
      databases: [{ name: 'terry_walters__mytrains', size: 100 }],
      totalCount: 1,
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
      expect(args).toEqual({ connectionId: 'preconfigured', database: 'terry_walters__mytrains' });
      return {
        collections: [{ name: 'stations' }, { name: 'trains' }],
        totalCount: 2,
      };
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
    vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockResolvedValue({
      databases: [
        { name: 'u_c5d09a77__railway_ops', size: 1 },
        { name: 'terry_walters__mytrains', size: 900 },
      ],
      totalCount: 2,
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
    vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockImplementation(async (name, args) => {
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
});
