import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  databaseFromMongoUri,
  deleteMongoShellConnection,
  listMongoShellConnections,
  maskMongoShellUri,
  MONGO_SHELL_CONNECTIONS_KEY,
  upsertMongoShellConnection,
} from './mongoShellConnections';

function installLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
}

describe('mongoShellConnections', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    localStorage.removeItem(MONGO_SHELL_CONNECTIONS_KEY);
  });

  it('masks credentials in URIs', () => {
    expect(maskMongoShellUri('mongodb+srv://user:secret@cluster.mongodb.net/db?retryWrites=true')).toBe(
      'mongodb+srv://***@cluster.mongodb.net/db',
    );
  });

  it('reads database from URI path', () => {
    expect(databaseFromMongoUri('mongodb+srv://u:p@cluster.mongodb.net/inventory?w=majority')).toBe(
      'inventory',
    );
    expect(databaseFromMongoUri('mongodb://localhost:27017')).toBeUndefined();
  });

  it('creates, updates, lists, and deletes connections', () => {
    const created = upsertMongoShellConnection({
      name: 'Local',
      uri: 'mongodb://localhost:27017',
    });
    expect(created.id).toBeTruthy();
    expect(listMongoShellConnections()).toHaveLength(1);

    const updated = upsertMongoShellConnection({
      id: created.id,
      name: 'Local renamed',
      uri: 'mongodb://127.0.0.1:27017/app',
    });
    expect(updated.name).toBe('Local renamed');
    expect(listMongoShellConnections()[0]?.uri).toContain('127.0.0.1');

    deleteMongoShellConnection(created.id);
    expect(listMongoShellConnections()).toHaveLength(0);
  });

  it('rejects empty URI', () => {
    expect(() => upsertMongoShellConnection({ name: 'x', uri: '  ' })).toThrow(/required/i);
  });
});
