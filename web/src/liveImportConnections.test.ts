import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLiveImportConnection,
  listLiveImportConnections,
  LIVE_IMPORT_CONNECTIONS_KEY,
  upsertLiveImportConnection,
} from './liveImportConnections';

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

describe('liveImportConnections', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    localStorage.removeItem(LIVE_IMPORT_CONNECTIONS_KEY);
  });

  it('creates, updates, lists, and deletes connections including empty URI', () => {
    const created = upsertLiveImportConnection({
      name: 'Local PG',
      engine: 'postgresql',
      uri: '',
      database: 'shop',
    });
    expect(created.id).toBeTruthy();
    expect(listLiveImportConnections()).toHaveLength(1);

    const updated = upsertLiveImportConnection({
      id: created.id,
      name: 'Local PG renamed',
      engine: 'postgresql',
      uri: 'postgresql://localhost:5432/shop',
      database: '',
    });
    expect(updated.name).toBe('Local PG renamed');
    expect(listLiveImportConnections()[0]?.uri).toContain('5432');

    deleteLiveImportConnection(created.id);
    expect(listLiveImportConnections()).toHaveLength(0);
  });
});
