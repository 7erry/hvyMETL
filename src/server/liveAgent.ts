import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { inferWorkloadProfile } from '../profiles/inferProfile.js';
import type { SqlStructuralModel } from '../types.js';
import {
  cancelExtractJob,
  createExtractJob,
  createExtractStagingDir,
  type ExtractJobState,
} from './agentExtractStaging.js';

/** Base TTL; sliding touch extends during WSS extract. */
export const SESSION_TTL_MS = 15 * 60 * 1000;
/** Long extracts keep the session alive up to this absolute ceiling from create. */
export const SESSION_MAX_TTL_MS = 12 * 60 * 60 * 1000;

export type AgentImportPayload = {
  model: SqlStructuralModel;
  ddl: string;
  dialect: string;
};

type AgentCommand = { id: string; op: 'introspect' };

export type AgentSession = {
  createdAt: number;
  expiresAt: number;
  command: AgentCommand | null;
  result: AgentImportPayload | null;
  error: string | null;
  /** When true, studio wants a full extract after schema. */
  wantExtract: boolean;
  extractJob: ExtractJobState | null;
  stagingRoot: string;
};

const sessions = new Map<string, AgentSession>();

export function sessionFor(token: string): AgentSession | null {
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

/** Slide expiry forward, capped by SESSION_MAX_TTL_MS from create. */
export function touchLiveAgentSession(token: string): AgentSession | null {
  const session = sessionFor(token);
  if (!session) return null;
  const ceiling = session.createdAt + SESSION_MAX_TTL_MS;
  session.expiresAt = Math.min(Date.now() + SESSION_TTL_MS, ceiling);
  return session;
}

/** One introspect request. The token is the only credential the agent needs. */
export function createLiveAgentSession(options?: {
  wantExtract?: boolean;
  stagingRoot?: string;
}): { token: string; expiresAt: string } {
  const token = randomBytes(24).toString('hex');
  const createdAt = Date.now();
  const stagingRoot = options?.stagingRoot ?? process.cwd();
  sessions.set(token, {
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    command: { id: randomBytes(8).toString('hex'), op: 'introspect' },
    result: null,
    error: null,
    wantExtract: options?.wantExtract !== false,
    extractJob: null,
    stagingRoot,
  });
  return { token, expiresAt: new Date(createdAt + SESSION_TTL_MS).toISOString() };
}

export function readLiveAgentCommand(token: string): AgentCommand | null {
  return sessionFor(token)?.command ?? null;
}

export function saveLiveAgentResult(token: string, payload: AgentImportPayload): void {
  const session = sessionFor(token);
  if (!session) throw new Error('Agent session expired.');
  if (!isStructuralModel(payload.model)) throw new Error('Agent result is not a schema.');
  if (typeof payload.ddl !== 'string' || typeof payload.dialect !== 'string') {
    throw new Error('Agent result is not a schema.');
  }
  if (/:\/\/\S/.test(payload.ddl)) throw new Error('Schema comment cannot include a connection string.');
  session.result = { model: payload.model, ddl: payload.ddl, dialect: payload.dialect };
  session.error = null;
  session.command = null;
  touchLiveAgentSession(token);
  if (session.wantExtract && !session.extractJob) {
    beginExtractJob(token, payload.model);
  }
}

export function saveLiveAgentError(token: string, error: string): void {
  const session = sessionFor(token);
  if (!session) throw new Error('Agent session expired.');
  session.error = error;
  session.command = null;
  if (session.extractJob) {
    session.extractJob.status = 'error';
    session.extractJob.error = error;
  }
}

export function readLiveAgentResult(token: string): { result: AgentImportPayload | null; error: string | null } | null {
  const session = sessionFor(token);
  if (!session) return null;
  return { result: session.result, error: session.error };
}

export function beginExtractJob(token: string, model: SqlStructuralModel): ExtractJobState {
  const session = sessionFor(token);
  if (!session) throw new Error('Agent session expired.');
  const stagingDir = createExtractStagingDir(session.stagingRoot, token);
  const job = createExtractJob(stagingDir);
  job.tables = model.tables.map((table) => ({
    name: table.name,
    columns: table.columns.map((column) => column.name),
    checkpoint: null,
    rowsReceived: 0,
    eof: false,
  }));
  job.status = 'pending';
  session.extractJob = job;
  touchLiveAgentSession(token);
  return job;
}

export function readExtractJob(token: string): ExtractJobState | null {
  return sessionFor(token)?.extractJob ?? null;
}

export function requestExtractCancel(token: string): void {
  const session = sessionFor(token);
  if (!session?.extractJob) return;
  cancelExtractJob(session.extractJob);
}

function isStructuralModel(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const model = value as SqlStructuralModel;
  return typeof model.source === 'string' && Array.isArray(model.tables) && Array.isArray(model.relationships);
}

/** @deprecated Prefer WSS `/api/agent/v2`. Kept for Node `hvymetl agent` transition. */
export function createLiveAgentPublicRouter(): Router {
  const router = Router();

  router.get('/next', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const command = readLiveAgentCommand(token);
    if (!sessionFor(token) && !command) {
      res.status(401).json({ error: 'Agent session expired.' });
      return;
    }
    if (!command) {
      res.status(204).end();
      return;
    }
    res.json(command);
  });

  router.post('/result', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    try {
      if (typeof req.body?.error === 'string' && req.body.error.trim()) {
        saveLiveAgentError(token, req.body.error);
      } else {
        saveLiveAgentResult(token, {
          model: req.body?.model as SqlStructuralModel,
          ddl: req.body?.ddl,
          dialect: req.body?.dialect,
        });
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent result was rejected.';
      res.status(400).json({ error: message });
    }
  });

  return router;
}

/** Called by the signed-in studio. */
export function createLiveAgentStudioRouter(options?: { stagingRoot?: string }): Router {
  const router = Router();

  router.post('/agent-session', (req, res) => {
    const wantExtract = req.body?.extract !== false;
    res.json(createLiveAgentSession({ wantExtract, stagingRoot: options?.stagingRoot }));
  });

  router.get('/agent-result', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const pending = readLiveAgentResult(token);
    if (!pending) {
      res.status(401).json({ error: 'Agent session expired.' });
      return;
    }
    if (pending.error) {
      res.status(400).json({ error: pending.error });
      return;
    }
    if (!pending.result) {
      res.status(204).end();
      return;
    }
    const inferred = inferWorkloadProfile(pending.result.model);
    const extract = readExtractJob(token);
    res.json({
      ...pending.result,
      inferred,
      extract: extract
        ? {
            id: extract.id,
            status: extract.status,
            stagingDir: extract.stagingDir,
            tables: extract.tables,
            error: extract.error,
          }
        : null,
    });
  });

  router.get('/agent-extract', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!sessionFor(token)) {
      res.status(401).json({ error: 'Agent session expired.' });
      return;
    }
    const extract = readExtractJob(token);
    if (!extract) {
      res.status(204).end();
      return;
    }
    res.json({
      id: extract.id,
      status: extract.status,
      stagingDir: extract.stagingDir,
      tables: extract.tables,
      error: extract.error,
    });
  });

  router.post('/agent-extract/cancel', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!sessionFor(token)) {
      res.status(401).json({ error: 'Agent session expired.' });
      return;
    }
    requestExtractCancel(token);
    res.json({ ok: true });
  });

  return router;
}
