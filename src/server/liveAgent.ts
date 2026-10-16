import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { inferWorkloadProfile } from '../profiles/inferProfile.js';
import type { SqlStructuralModel } from '../types.js';

const SESSION_TTL_MS = 15 * 60 * 1000;

export type AgentImportPayload = {
  model: SqlStructuralModel;
  ddl: string;
  dialect: string;
};

type AgentCommand = { id: string; op: 'introspect' };

type AgentSession = {
  expiresAt: number;
  command: AgentCommand | null;
  result: AgentImportPayload | null;
  error: string | null;
};

const sessions = new Map<string, AgentSession>();

function sessionFor(token: string): AgentSession | null {
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

/** One introspect request. The token is the only credential the agent needs. */
export function createLiveAgentSession(): { token: string; expiresAt: string } {
  const token = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    expiresAt,
    command: { id: randomBytes(8).toString('hex'), op: 'introspect' },
    result: null,
    error: null,
  });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
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
}

export function saveLiveAgentError(token: string, error: string): void {
  const session = sessionFor(token);
  if (!session) throw new Error('Agent session expired.');
  session.error = error;
  session.command = null;
}

export function readLiveAgentResult(token: string): { result: AgentImportPayload | null; error: string | null } | null {
  const session = sessionFor(token);
  if (!session) return null;
  return { result: session.result, error: session.error };
}

function isStructuralModel(value: unknown): value is SqlStructuralModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as SqlStructuralModel;
  return typeof model.source === 'string' && Array.isArray(model.tables) && Array.isArray(model.relationships);
}

/** Called by the agent. The token is the credential. */
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
export function createLiveAgentStudioRouter(): Router {
  const router = Router();

  router.post('/agent-session', (_req, res) => {
    res.json(createLiveAgentSession());
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
    res.json({ ...pending.result, inferred });
  });

  return router;
}
