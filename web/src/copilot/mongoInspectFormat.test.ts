import { describe, expect, it } from 'vitest';
import {
  formatInspectBytes,
  formatInspectStorageSize,
  readMongoInspectCollectionRows,
  readMongoInspectDatabaseRows,
} from './mongoInspectFormat.js';

describe('mongoInspectFormat', () => {
  it('formats database and collection inspect rows', () => {
    expect(formatInspectBytes(1536)).toBe('1.5 KB');
    expect(formatInspectStorageSize(2.5, 'MB')).toBe('2.5 MB');
    expect(readMongoInspectDatabaseRows({ databases: [{ name: 'mytrains', size: 900 }] })).toEqual([
      { name: 'mytrains', size: 900 },
    ]);
    expect(
      readMongoInspectCollectionRows({
        database: 'mytrains',
        collections: [{ name: 'routes', documentCount: 10, storageSize: 1.2, storageSizeUnits: 'MB', indexCount: 2 }],
      }),
    ).toEqual({
      database: 'mytrains',
      collections: [{ name: 'routes', documentCount: 10, storageSize: 1.2, storageSizeUnits: 'MB', indexCount: 2 }],
    });
  });
});
