import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  AGENT_EXTRACT_MAX_FRAME_BYTES,
  applyExtractChunk,
  markExtractComplete,
  markExtractError,
} from './agentExtractStaging.js';
import {
  readExtractJob,
  readLiveAgentCommand,
  saveLiveAgentError,
  saveLiveAgentResult,
  sessionFor,
  touchLiveAgentSession,
  type AgentImportPayload,
} from './liveAgent.js';

type AgentHello = {
  type: 'hello';
  protocol: number;
  agentVersion?: string;
  engines?: string[];
};

type AgentSchema = {
  type: 'schema';
  model: AgentImportPayload['model'];
  ddl: string;
  dialect: string;
};

type AgentExtractChunk = {
  type: 'extract_chunk';
  jobId: string;
  table: string;
  checkpoint: string;
  columns?: string[];
  rows: unknown[][];
  eof?: boolean;
};

type AgentError = { type: 'error'; jobId?: string; message: string };
type AgentPong = { type: 'pong' };
type AgentBye = { type: 'bye' };

type AgentInbound = AgentHello | AgentSchema | AgentExtractChunk | AgentError | AgentPong | AgentBye;

function send(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function parseInbound(raw: string): AgentInbound | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
    return null;
  }
  return parsed as AgentInbound;
}

function sendExtractIfReady(socket: WebSocket, token: string): void {
  const job = readExtractJob(token);
  if (!job || job.status === 'complete' || job.status === 'cancelled' || job.status === 'error') return;
  if (job.tables.length === 0) return;
  job.status = 'running';
  send(socket, {
    type: 'extract',
    jobId: job.id,
    chunkRows: job.chunkRows,
    format: 'csv-rows',
    tables: job.tables.map((table) => ({
      name: table.name,
      columns: table.columns,
      checkpoint: table.checkpoint,
    })),
  });
}

async function handleMessage(socket: WebSocket, token: string, raw: string): Promise<void> {
  if (Buffer.byteLength(raw, 'utf8') > AGENT_EXTRACT_MAX_FRAME_BYTES) {
    send(socket, { type: 'error', message: 'Frame exceeds size limit.' });
    socket.close(1009, 'frame too large');
    return;
  }
  const session = touchLiveAgentSession(token);
  if (!session) {
    send(socket, { type: 'error', message: 'Agent session expired.' });
    socket.close(4401, 'expired');
    return;
  }

  const message = parseInbound(raw);
  if (!message) {
    send(socket, { type: 'error', message: 'Invalid agent message.' });
    return;
  }

  switch (message.type) {
    case 'hello': {
      if (message.protocol !== 1) {
        send(socket, { type: 'error', message: 'Unsupported agent protocol.' });
        socket.close(1002, 'protocol');
        return;
      }
      send(socket, { type: 'welcome', expiresAt: new Date(session.expiresAt).toISOString() });
      const command = readLiveAgentCommand(token);
      if (command) send(socket, { type: 'introspect', id: command.id });
      else if (session.result && session.wantExtract) sendExtractIfReady(socket, token);
      return;
    }
    case 'schema': {
      try {
        saveLiveAgentResult(token, {
          model: message.model,
          ddl: message.ddl,
          dialect: message.dialect,
        });
        send(socket, { type: 'schema_ok' });
        sendExtractIfReady(socket, token);
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Schema rejected.';
        saveLiveAgentError(token, text);
        send(socket, { type: 'error', message: text });
      }
      return;
    }
    case 'extract_chunk': {
      const job = readExtractJob(token);
      if (!job || job.id !== message.jobId) {
        send(socket, { type: 'error', jobId: message.jobId, message: 'Unknown extract job.' });
        return;
      }
      if (job.status === 'cancelled') {
        send(socket, { type: 'cancel', jobId: job.id });
        return;
      }
      const tableMeta = job.tables.find((table) => table.name === message.table);
      const columns = message.columns?.length ? message.columns : tableMeta?.columns ?? [];
      try {
        applyExtractChunk({
          job,
          table: message.table,
          checkpoint: message.checkpoint,
          columns,
          rows: Array.isArray(message.rows) ? message.rows : [],
          eof: Boolean(message.eof),
        });
        markExtractComplete(job);
        send(socket, {
          type: 'ack',
          jobId: job.id,
          table: message.table,
          checkpoint: message.checkpoint,
        });
        if (job.status === 'complete') send(socket, { type: 'extract_complete', jobId: job.id });
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Extract chunk rejected.';
        markExtractError(job, text);
        send(socket, { type: 'error', jobId: job.id, message: text });
      }
      return;
    }
    case 'error': {
      saveLiveAgentError(token, message.message || 'Agent error.');
      const job = readExtractJob(token);
      if (job) markExtractError(job, message.message || 'Agent error.');
      return;
    }
    case 'pong':
      return;
    case 'bye':
      socket.close(1000, 'bye');
      return;
    default:
      send(socket, { type: 'error', message: 'Unsupported agent message type.' });
  }
}

/** Attach `/api/agent/v2` WebSocket upgrade to the HTTP server. */
export function attachLiveAgentWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: AGENT_EXTRACT_MAX_FRAME_BYTES,
  });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost';
    const url = new URL(request.url ?? '/', `http://${host}`);
    if (url.pathname !== '/api/agent/v2') return;
    const token = url.searchParams.get('token') ?? '';
    if (!sessionFor(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, token);
    });
  });

  wss.on('connection', (ws: WebSocket, _request: unknown, token: string) => {
    touchLiveAgentSession(token);
    const pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) send(ws, { type: 'ping' });
    }, 30_000);

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      void handleMessage(ws, token, raw);
    });
    ws.on('close', () => clearInterval(pingTimer));
    ws.on('error', () => clearInterval(pingTimer));
  });

  return wss;
}
