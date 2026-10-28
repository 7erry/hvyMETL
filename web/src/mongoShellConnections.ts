/** Browser-only named MongoDB connections for MongoShell (never synced to the server). */

export type MongoShellConnection = {
  id: string;
  name: string;
  uri: string;
  updatedAt: string;
};

export const MONGO_SHELL_CONNECTIONS_KEY = 'hvymetl.mongoshell.connections';

/** Mask credentials in a MongoDB URI for list labels. */
export function maskMongoShellUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/\/[^@]+@/, '//***@').split('?')[0] ?? trimmed;
}

/** Database path segment from a MongoDB URI, if present. */
export function databaseFromMongoUri(uri: string): string | undefined {
  const trimmed = uri.trim();
  if (!trimmed) return undefined;
  try {
    const normalized = trimmed
      .replace(/^mongodb\+srv:/i, 'https:')
      .replace(/^mongodb:/i, 'http:');
    const pathname = new URL(normalized).pathname.replace(/^\//, '');
    const name = pathname.split('/')[0]?.trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

function readRaw(): MongoShellConnection[] {
  try {
    const raw = localStorage.getItem(MONGO_SHELL_CONNECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is MongoShellConnection => {
        if (!entry || typeof entry !== 'object') return false;
        const row = entry as Partial<MongoShellConnection>;
        return (
          typeof row.id === 'string' &&
          typeof row.name === 'string' &&
          typeof row.uri === 'string' &&
          typeof row.updatedAt === 'string'
        );
      })
      .map((row) => ({
        id: row.id,
        name: row.name.trim() || 'Untitled',
        uri: row.uri,
        updatedAt: row.updatedAt,
      }));
  } catch {
    return [];
  }
}

function writeRaw(connections: MongoShellConnection[]): void {
  localStorage.setItem(MONGO_SHELL_CONNECTIONS_KEY, JSON.stringify(connections));
}

export function listMongoShellConnections(): MongoShellConnection[] {
  return readRaw().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertMongoShellConnection(
  input: { id?: string; name: string; uri: string },
): MongoShellConnection {
  const connections = readRaw();
  const now = new Date().toISOString();
  const name = input.name.trim() || 'Untitled';
  const uri = input.uri.trim();
  if (!uri) throw new Error('MongoDB URI is required.');

  if (input.id) {
    const index = connections.findIndex((c) => c.id === input.id);
    if (index >= 0) {
      const next: MongoShellConnection = {
        ...connections[index],
        name,
        uri,
        updatedAt: now,
      };
      connections[index] = next;
      writeRaw(connections);
      return next;
    }
  }

  const created: MongoShellConnection = {
    id: crypto.randomUUID(),
    name,
    uri,
    updatedAt: now,
  };
  connections.push(created);
  writeRaw(connections);
  return created;
}

export function deleteMongoShellConnection(id: string): void {
  writeRaw(readRaw().filter((c) => c.id !== id));
}

export function getMongoShellConnection(id: string): MongoShellConnection | null {
  return readRaw().find((c) => c.id === id) ?? null;
}
