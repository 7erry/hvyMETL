import { describe, expect, it, vi } from 'vitest';
import * as mongoMcpClient from './mongoMcpClient.js';
import { invokeMongoInspectTool } from './mongoInspectService.js';

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
    vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockImplementation(async (name) => {
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
});
