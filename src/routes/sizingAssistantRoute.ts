/**
 * HTTP routes for the Release 4.0 sizing assistant.
 */

import { Router, type Request, type Response } from 'express';
import {
  auditCopilotEvent,
  CopilotRequestValidationError,
  sanitizeCopilotChatMessages,
} from '../copilot/copilotRequestGuard.js';
import {
  isSizingAssistantConfigured,
  runSizingAssistantChat,
} from '../copilot/sizingAssistantChat.js';
import {
  createSizingSession,
  getSizingSession,
} from '../copilot/sizingAssistantSession.js';
import {
  applyStudioSeedToSession,
  type SizingAssistantStudioSeedPayload,
} from '../copilot/sizingAssistantStudioSeed.js';
import { executeSizingAssistantTool, setSessionTranscripts } from '../copilot/sizingAssistantTools.js';
import { isSizingAssistantToolName } from '../copilot/sizingAssistantToolSchemas.js';
import { stripPricingFields } from '../copilot/sizingAssistantPresentation.js';
import { getRequestTenantId } from '../server/tenant.js';
import { createCopilotRateLimitMiddleware } from '../server/copilotRateLimit.js';

type RequestWithAuth = Request & {
  auth?: {
    payload?: Record<string, unknown>;
  };
};

function readCopilotAuditIdentity(req: Request): { tenantId: string | null; userSub: string | null } {
  try {
    const tenantId = getRequestTenantId(req as RequestWithAuth);
    const sub = req.auth?.payload?.sub;
    return {
      tenantId,
      userSub: typeof sub === 'string' ? sub : null,
    };
  } catch {
    return { tenantId: null, userSub: null };
  }
}

function parseChatMessages(raw: unknown) {
  return sanitizeCopilotChatMessages(raw, {
    allowToolMessages: false,
    allowAssistantMessages: true,
  });
}

function handleSizingError(res: Response, error: unknown): void {
  if (error instanceof CopilotRequestValidationError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/not configured/i.test(message)) {
    res.status(503).json({ error: message });
    return;
  }
  if (/not found|aborted/i.test(message)) {
    res.status(404).json({ error: message });
    return;
  }
  res.status(400).json({ error: message });
}

function parseStudioSeed(raw: unknown): SizingAssistantStudioSeedPayload | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return raw as SizingAssistantStudioSeedPayload;
}

export function createSizingAssistantRouter(): Router {
  const router = Router();
  const sizingChatRateLimit = createCopilotRateLimitMiddleware('sizing-chat');

  router.get('/status', (_req, res) => {
    res.json({
      configured: isSizingAssistantConfigured(),
      model: process.env.GROVE_MODEL?.trim() || 'gpt-5.6-luna',
    });
  });

  router.post('/session', (req, res) => {
    let session = createSizingSession();
    const studioSeed = parseStudioSeed(req.body?.studioSeed);
    let appliedKeys: string[] = [];
    if (studioSeed) {
      const applied = applyStudioSeedToSession(session, studioSeed);
      session = applied.session;
      appliedKeys = applied.appliedKeys;
    }
    res.status(201).json({
      sessionId: session.sessionId,
      parameters: session.parameters,
      shardPenaltyMultiplier: session.shardPenaltyMultiplier,
      resourceCuratorHandoff: session.resourceCuratorHandoff,
      studioSeedAppliedKeys: appliedKeys,
    });
  });

  router.post('/session/:sessionId/seed', (req, res) => {
    try {
      const sessionId = String(req.params.sessionId ?? '').trim();
      const session = getSizingSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Sizing session not found.' });
        return;
      }
      const studioSeed = parseStudioSeed(req.body?.studioSeed);
      if (!studioSeed) {
        res.status(400).json({ error: 'studioSeed object is required.' });
        return;
      }
      const applied = applyStudioSeedToSession(session, studioSeed);
      res.json({
        sessionId: applied.session.sessionId,
        parameters: applied.session.parameters,
        studioSeedAppliedKeys: applied.appliedKeys,
      });
    } catch (error) {
      handleSizingError(res, error);
    }
  });

  router.get('/session/:sessionId', (req, res) => {
    const session = getSizingSession(String(req.params.sessionId ?? '').trim());
    if (!session) {
      res.status(404).json({ error: 'Sizing session not found.' });
      return;
    }
    res.json({
      sessionId: session.sessionId,
      aborted: session.aborted,
      parameters: session.parameters,
      shardPenaltyMultiplier: session.shardPenaltyMultiplier,
      resourceCuratorHandoff: session.resourceCuratorHandoff,
      transcriptCount: session.transcripts.length,
      updatedAt: session.updatedAt,
    });
  });

  router.put('/session/:sessionId/transcripts', (req, res) => {
    try {
      const sessionId = String(req.params.sessionId ?? '').trim();
      const raw = req.body?.transcripts;
      if (!Array.isArray(raw)) {
        res.status(400).json({ error: 'transcripts array is required.' });
        return;
      }
      const transcripts = raw
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((item, index) => ({
          id: typeof item.id === 'string' ? item.id : `transcript-${index + 1}`,
          title: typeof item.title === 'string' ? item.title : `Transcript ${index + 1}`,
          body: typeof item.body === 'string' ? item.body : '',
        }))
        .filter((item) => item.body.length > 0);

      const session = setSessionTranscripts(sessionId, transcripts);
      res.json({ sessionId: session.sessionId, transcriptCount: session.transcripts.length });
    } catch (error) {
      handleSizingError(res, error);
    }
  });

  router.post('/tools', (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId ?? '').trim();
      const tool = String(req.body?.tool ?? '').trim();
      const args =
        req.body?.args && typeof req.body.args === 'object'
          ? (req.body.args as Record<string, unknown>)
          : {};

      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required.' });
        return;
      }
      if (!isSizingAssistantToolName(tool)) {
        res.status(400).json({ error: `Unknown sizing assistant tool "${tool}".` });
        return;
      }

      const result = executeSizingAssistantTool(sessionId, tool, args);
      res.json({
        ...result,
        data: result.data ? stripPricingFields(result.data) : undefined,
      });
    } catch (error) {
      handleSizingError(res, error);
    }
  });

  router.post('/chat', sizingChatRateLimit, async (req, res) => {
    const identity = readCopilotAuditIdentity(req);
    try {
      const sessionId = String(req.body?.sessionId ?? '').trim();
      const messages = parseChatMessages(req.body?.messages);

      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required.' });
        return;
      }

      const studioSeed = parseStudioSeed(req.body?.studioSeed);
      auditCopilotEvent({
        kind: 'sizing.chat',
        tenantId: identity.tenantId,
        userSub: identity.userSub,
        messageCount: messages.length,
        ok: true,
      });

      const result = await runSizingAssistantChat({
        sessionId,
        messages,
        maxToolRounds: typeof req.body?.maxToolRounds === 'number' ? req.body.maxToolRounds : undefined,
        studioSeed,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof CopilotRequestValidationError) {
        auditCopilotEvent({
          kind: 'copilot.validation_failed',
          tenantId: identity.tenantId,
          userSub: identity.userSub,
          reason: error.message,
          ok: false,
        });
      }
      handleSizingError(res, error);
    }
  });

  return router;
}
