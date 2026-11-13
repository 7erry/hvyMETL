/** Browser-only saved live-import connections (never synced to the server). */

export type LiveImportEngine = 'mongodb' | 'postgresql' | 'mysql' | 'mssql' | 'sqlite';

export type LiveImportConnection = {
  id: string;
  name: string;
  engine: LiveImportEngine;
  uri: string;
  database: string;
  updatedAt: string;
};

export const LIVE_IMPORT_CONNECTIONS_KEY = 'hvymetl.liveimport.connections';

const ENGINES: ReadonlySet<string> = new Set(['mongodb', 'postgresql', 'mysql', 'mssql', 'sqlite']);

function isEngine(value: unknown): value is LiveImportEngine {
  return typeof value === 'string' && ENGINES.has(value);
}

function readRaw(): LiveImportConnection[] {
  try {
    const raw = localStorage.getItem(LIVE_IMPORT_CONNECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is LiveImportConnection => {
        if (!entry || typeof entry !== 'object') return false;
        const row = entry as Partial<LiveImportConnection>;
        return (
          typeof row.id === 'string' &&
          typeof row.name === 'string' &&
          isEngine(row.engine) &&
          typeof row.uri === 'string' &&
          typeof row.database === 'string' &&
          typeof row.updatedAt === 'string'
        );
      })
      .map((row) => ({
        id: row.id,
        name: row.name.trim() || 'Untitled',
        engine: row.engine,
        uri: row.uri,
        database: row.database,
        updatedAt: row.updatedAt,
      }));
  } catch {
    return [];
  }
}

function writeRaw(connections: LiveImportConnection[]): void {
  localStorage.setItem(LIVE_IMPORT_CONNECTIONS_KEY, JSON.stringify(connections));
}

export function listLiveImportConnections(): LiveImportConnection[] {
  return readRaw().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertLiveImportConnection(input: {
  id?: string;
  name: string;
  engine: LiveImportEngine;
  uri: string;
  database?: string;
}): LiveImportConnection {
  const connections = readRaw();
  const now = new Date().toISOString();
  const name = input.name.trim() || 'Untitled';
  const uri = input.uri.trim();
  const database = (input.database ?? '').trim();
  const engine = input.engine;

  if (input.id) {
    const index = connections.findIndex((c) => c.id === input.id);
    if (index >= 0) {
      const next: LiveImportConnection = {
        ...connections[index],
        name,
        engine,
        uri,
        database,
        updatedAt: now,
      };
      connections[index] = next;
      writeRaw(connections);
      return next;
    }
  }

  const created: LiveImportConnection = {
    id: crypto.randomUUID(),
    name,
    engine,
    uri,
    database,
    updatedAt: now,
  };
  connections.push(created);
  writeRaw(connections);
  return created;
}

export function deleteLiveImportConnection(id: string): void {
  writeRaw(readRaw().filter((c) => c.id !== id));
}

export function getLiveImportConnection(id: string): LiveImportConnection | null {
  return readRaw().find((c) => c.id === id) ?? null;
}
