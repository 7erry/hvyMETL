import { importLiveMongoDatabase, mongoDatabaseName, publicMongoError } from './liveMongoImport.js';
import { importLiveSqlDatabase, liveSqlEngine, sqlDatabaseName } from './liveSqlImport.js';
import type { AgentImportPayload } from '../server/liveAgent.js';

export type LiveAgentIntrospect = (uri: string, database?: string) => Promise<AgentImportPayload>;

/** Run the connection on this machine and return a schema with no connection string in the comment. */
export async function introspectLiveConnection(uri: string, database?: string): Promise<AgentImportPayload> {
  const sqlEngine = liveSqlEngine(uri);
  if (sqlEngine) {
    const named = sqlDatabaseName(uri, database);
    const imported = await importLiveSqlDatabase(uri, named.database, named.schema);
    const label = imported.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL';
    return {
      model: imported.model,
      ddl: `// Live ${label} database ${named.database}. Schema read from information_schema.\n`,
      dialect: imported.engine,
    };
  }
  const mongoDatabase = mongoDatabaseName(uri, database);
  const model = await importLiveMongoDatabase(uri, mongoDatabase);
  return {
    model,
    ddl: `// Live MongoDB database ${mongoDatabase}. Schema inferred from a sample of documents.\n`,
    dialect: 'mongodb-json',
  };
}

/**
 * Dial the studio, wait for an introspect request, and send the schema back.
 * The URI stays on this machine.
 */
export async function runLiveAgent(options: {
  token: string;
  uri: string;
  database?: string;
  server: string;
  introspect?: LiveAgentIntrospect;
  timeoutMs?: number;
}): Promise<void> {
  const server = options.server.replace(/\/$/, '');
  const introspect = options.introspect ?? introspectLiveConnection;
  const deadline = Date.now() + (options.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    const next = await fetch(`${server}/api/agent/next?token=${encodeURIComponent(options.token)}`);
    if (next.status === 401) throw new Error('Agent session expired.');
    if (next.status === 204) continue;
    if (!next.ok) throw new Error(`Studio agent endpoint returned HTTP ${next.status}.`);
    const command = (await next.json()) as { id?: string };
    if (!command.id) continue;
    try {
      const payload = await introspect(options.uri, options.database);
      const posted = await fetch(`${server}/api/agent/result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: options.token, ...payload }),
      });
      if (!posted.ok) throw new Error(`Studio rejected the schema (HTTP ${posted.status}).`);
    } catch (error) {
      await fetch(`${server}/api/agent/result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: options.token, error: publicMongoError(error) }),
      });
      throw error;
    }
    return;
  }
  throw new Error('The studio did not ask for a schema in time.');
}
