import { describe, expect, it } from 'vitest';
import { assertLiveMongoUri, mongoDatabaseName, publicMongoError } from './liveMongoImport.js';

describe('live MongoDB import', () => {
  it('reads the database from the URI path', () => {
    expect(mongoDatabaseName('mongodb://localhost:27017/shop')).toBe('shop');
    expect(mongoDatabaseName('mongodb://localhost:27017/shop', 'other')).toBe('other');
    expect(() => mongoDatabaseName('mongodb://localhost:27017')).toThrow(/Database name is required/);
    expect(() => assertLiveMongoUri('postgres://localhost/shop')).toThrow(/mongodb:\/\//);
  });

  it('hides a connection string when MongoDB reports a failure', () => {
    expect(publicMongoError(new Error('failed mongodb://user:secret@localhost:27017/shop'))).toBe(
      'Could not connect to MongoDB.',
    );
    expect(publicMongoError(new Error('Database name is required.'))).toBe('Database name is required.');
    expect(publicMongoError(new Error('Live import needs a mongodb:// or mongodb+srv:// URI.'))).toBe(
      'Live import needs a mongodb:// or mongodb+srv:// URI.',
    );
  });
});
