import { WebSocket } from 'ws';
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

function studioAgentWebSocketUrl(server: string): string {
  const trimmed = server.replace(/\/$/, '');
  const wsBase = trimmed.startsWith('https://')
    ? `wss://${trimmed.slice('https://'.length)}`
    : trimmed.startsWith('http://')
      ? `ws://${trimmed.slice('http://'.length)}`
      : trimmed.startsWith('ws://') || trimmed.startsWith('wss://')
        ? trimmed
        : '';
  if (!wsBase) throw new Error('Studio server must be an http(s) URL.');
  return `${wsBase}/api/agent/v2`;
}

/**
 * Dial the studio over WebSocket, wait for an introspect request, and send the schema back.
 * The URI stays on this machine. The session token is an Authorization header, not a query parameter.
 */
export async function runLiveAgent(options: {
  token: string;
  uri: string;
  database?: string;
  server: string;
  introspect?: LiveAgentIntrospect;
  timeoutMs?: number;
}): Promise<void> {
  const introspect = options.introspect ?? introspectLiveConnection;
  const ws = new WebSocket(studioAgentWebSocketUrl(options.server), {
    headers: { Authorization: `Bearer ${options.token}` },
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      ws.close();
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => {
      finish(new Error('The studio did not ask for a schema in time.'));
    }, options.timeoutMs ?? 180_000);

    ws.on('error', (error: Error) => finish(error));
    ws.on('unexpected-response', (_request, response) => {
      const status = response.statusCode ?? 0;
      finish(
        new Error(
          status === 401 ? 'Agent session expired.' : `Studio agent endpoint returned HTTP ${status}.`,
        ),
      );
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', protocol: 1, agentVersion: 'node', engines: ['mongodb'] }));
    });
    ws.on('message', (raw: WebSocket.RawData) => {
      void (async () => {
        let message: { type?: string; message?: string };
        try {
          message = JSON.parse(String(raw)) as { type?: string; message?: string };
        } catch {
          return;
        }
        if (message.type === 'error') {
          finish(new Error(message.message || 'Agent session expired.'));
          return;
        }
        if (message.type === 'schema_ok') {
          finish();
          return;
        }
        if (message.type !== 'introspect') return;
        try {
          const payload = await introspect(options.uri, options.database);
          ws.send(JSON.stringify({ type: 'schema', ...payload }));
        } catch (error) {
          const text = publicMongoError(error);
          ws.send(JSON.stringify({ type: 'error', message: text }));
          finish(error instanceof Error ? error : new Error(text));
        }
      })();
    });
  });
}
