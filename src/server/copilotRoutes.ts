/**
 * Agent copilot API — proxies chat to Grove OpenAI-compatible endpoint.
 */

import { Router, type Response } from 'express';
import {
  callGroveChat,
  isGroveConfigured,
  type CopilotChatMessage,
  type CopilotSchemaContext,
} from '../copilot/groveChat.js';

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

function parseSchemaContext(raw: unknown): CopilotSchemaContext {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    tables: Array.isArray(body.tables) ? (body.tables as CopilotSchemaContext['tables']) : [],
    relationships: Array.isArray(body.relationships)
      ? (body.relationships as CopilotSchemaContext['relationships'])
      : [],
    guardrailIssues: Array.isArray(body.guardrailIssues)
      ? (body.guardrailIssues as CopilotSchemaContext['guardrailIssues'])
      : [],
    cardinalityOverrides:
      body.cardinalityOverrides && typeof body.cardinalityOverrides === 'object'
        ? (body.cardinalityOverrides as Record<string, number>)
        : {},
    forceEmbedOverrides:
      body.forceEmbedOverrides && typeof body.forceEmbedOverrides === 'object'
        ? (body.forceEmbedOverrides as Record<string, boolean>)
        : {},
    collections: Array.isArray(body.collections)
      ? (body.collections as CopilotSchemaContext['collections'])
      : undefined,
  };
}

function handleCopilotError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (/not configured/i.test(message)) {
    res.status(503).json({ error: message });
    return;
  }
  res.status(502).json({ error: message });
}

export function createCopilotRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      configured: isGroveConfigured(),
      model: process.env.GROVE_MODEL?.trim() || 'gpt-5.6-luna',
    });
  });

  router.post('/chat', async (req, res) => {
    try {
      const messages = parseChatMessages(req.body?.messages);
      const schemaContext = parseSchemaContext(req.body?.schemaContext);
      const toolsEnabled = req.body?.toolsEnabled !== false;

      if (!messages.some((m) => m.role === 'user' || m.role === 'tool')) {
        res.status(400).json({ error: 'At least one user or tool message is required.' });
        return;
      }

      const result = await callGroveChat({ messages, schemaContext, toolsEnabled });
      res.json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  return router;
}
