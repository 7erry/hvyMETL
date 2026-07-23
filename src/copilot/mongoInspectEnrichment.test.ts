import { describe, expect, it, vi } from 'vitest';
import * as mongoMcpClient from './mongoMcpClient.js';
import { enrichCollectionSummaries } from './mongoInspectEnrichment.js';

describe('mongoInspectEnrichment', () => {
  it('enriches each collection with count, storage size, and indexes', async () => {
    vi.spyOn(mongoMcpClient, 'callMongoMcpTool').mockImplementation(async (name, args) => {
      const collection = (args as { collection?: string }).collection;
      if (name === 'count') return { count: collection === 'routes' ? 120 : 45 };
      if (name === 'collection-storage-size') return { size: 2.5, units: 'MB' };
      if (name === 'collection-indexes') return { classicIndexesCount: 2, searchIndexesCount: 1 };
      throw new Error(`Unexpected tool ${name}`);
    });

    const summaries = await enrichCollectionSummaries('terry_walters__mytrains', [
      { name: 'routes' },
      { name: 'stations' },
    ]);

    expect(summaries).toEqual([
      {
        name: 'routes',
        documentCount: 120,
        storageSize: 2.5,
        storageSizeUnits: 'MB',
        indexCount: 3,
      },
      {
        name: 'stations',
        documentCount: 45,
        storageSize: 2.5,
        storageSizeUnits: 'MB',
        indexCount: 3,
      },
    ]);
    vi.restoreAllMocks();
  });
});
