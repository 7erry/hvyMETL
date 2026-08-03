/**
 * HTTP routes for the Release 4.0 sizing assistant.
 */

import { Router, type Response } from 'express';
import type { CopilotChatMessage } from '../copilot/groveChat.js';
import {
  isSizingAssistantConfigured,
  runSizingAssistantChat,
} from '../copilot/sizingAssistantChat.js';
import {
  createSizingSession,
  getSizingSession,
} from '../copilot/sizingAssistantSession.js';
import { executeSizingAssistantTool, setSessionTranscripts } from '../copilot/sizingAssistantTools.js';
import { isSizingAssistantToolName } from '../copilot/sizingAssistantToolSchemas.js';
import { stripPricingFields } from '../copilot/sizingAssistantPresentation.js';

function parseChatMessages(raw: unknown): CopilotChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      role: item.role as CopilotChatMessage['role'],
      content: typeof item.content === 'string' ? item.content : '',
      ...(typeof item.tool_call_id === 'string' ? { tool_call_id: item.tool_call_id } : {}),
      ...(Array.isArray(item.tool_calls) ? { tool_calls: item.tool_calls as CopilotChatMessage['tool_calls'] } : {}),
    }))
    .filter((msg) => ['system', 'user', 'assistant', 'tool'].includes(msg.role));
}

function handleSizingError(res: Response, error: unknown): void {
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

export function createSizingAssistantRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      configured: isSizingAssistantConfigured(),
      model: process.env.GROVE_MODEL?.trim() || 'gpt-5.6-luna',
    });
  });

  router.post('/session', (_req, res) => {
    const session = createSizingSession();
    res.status(201).json({
      sessionId: session.sessionId,
      parameters: session.parameters,
      shardPenaltyMultiplier: session.shardPenaltyMultiplier,
      resourceCuratorHandoff: session.resourceCuratorHandoff,
    });
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

  router.post('/chat', async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId ?? '').trim();
      const messages = parseChatMessages(req.body?.messages);

      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required.' });
        return;
      }
      if (!messages.some((message) => message.role === 'user' || message.role === 'tool')) {
        res.status(400).json({ error: 'At least one user or tool message is required.' });
        return;
      }

      const result = await runSizingAssistantChat({
        sessionId,
        messages,
        maxToolRounds: typeof req.body?.maxToolRounds === 'number' ? req.body.maxToolRounds : undefined,
      });

      res.json(result);
    } catch (error) {
      handleSizingError(res, error);
    }
  });

  return router;
}
