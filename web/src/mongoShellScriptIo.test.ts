import { beforeEach, describe, expect, it } from 'vitest';
import {
  exportMongoShellLibraryJson,
  importMongoShellLibraryJson,
  listMongoShellHistory,
  listMongoShellLibrary,
  pushMongoShellHistory,
  upsertMongoShellLibraryEntry,
} from './mongoShellScriptIo';

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

describe('mongoShellScriptIo', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('pushes newest first and dedupes identical script', () => {
    pushMongoShellHistory('db.a.find()');
    pushMongoShellHistory('db.b.find()');
    pushMongoShellHistory('db.a.find()');
    const hist = listMongoShellHistory();
    expect(hist).toHaveLength(2);
    expect(hist[0].script).toBe('db.a.find()');
    expect(hist[1].script).toBe('db.b.find()');
  });

  it('saves library scripts by project and round-trips export', () => {
    upsertMongoShellLibraryEntry({
      name: 'Top customers',
      project: 'retail',
      script: 'db.orders.aggregate([])',
    });
    expect(listMongoShellLibrary()[0].project).toBe('retail');
    const json = exportMongoShellLibraryJson();
    installLocalStorage();
    expect(importMongoShellLibraryJson(json)).toBe(1);
    expect(listMongoShellLibrary()[0].name).toBe('Top customers');
  });
});
