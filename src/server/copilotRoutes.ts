/**
 * Agent copilot API — proxies chat to Grove OpenAI-compatible endpoint.
 */

import { Router, type Request, type Response } from 'express';
import {
  auditCopilotEvent,
  CopilotRequestValidationError,
  sanitizeCopilotChatMessages,
  sanitizeCopilotSchemaContext,
} from '../copilot/copilotRequestGuard.js';
import {
  callGroveChat,
  isGroveConfigured,
} from '../copilot/groveChat.js';
import { invokeMongoInspectTool } from '../copilot/mongoInspectService.js';
import { createMongoAutoEmbedVectorIndex } from '../copilot/mongoVectorIndexService.js';
import { createMongoAtlasSearchIndex } from '../copilot/mongoAtlasSearchIndexService.js';
import { parseMongoPlanContext } from '../copilot/mongoPlanContext.js';
import { isMongoInspectToolName } from '../copilot/mongoInspectToolSchemas.js';
import { isMongoMcpEnabled, probeMongoMcpAvailability } from '../copilot/mongoMcpClient.js';
import {
  architectureReviewFilename,
  createArchitectureExport,
  isArchitectureReviewContent,
  readArchitectureExport,
} from '../copilot/architectureReviewExport.js';
import { readGoogleDriveClientId } from '../copilot/googleDriveConfig.js';
import { getRequestTenantId } from './tenant.js';
import {
  beginCopilotChatSse,
  startCopilotChatSseKeepalive,
  writeCopilotChatSseEvent,
} from '../copilot/copilotChatStream.js';
import { createCopilotRateLimitMiddleware } from './copilotRateLimit.js';

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

function handleCopilotError(res: Response, error: unknown, options?: { sse?: boolean }): void {
  if (options?.sse && !res.headersSent) {
    beginCopilotChatSse(res);
    const message =
      error instanceof CopilotRequestValidationError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    writeCopilotChatSseEvent(res, { event: 'error', data: { error: message } });
    res.end();
    return;
  }
  if (error instanceof CopilotRequestValidationError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|TimeoutError|AbortError/i.test(message)) {
    res.status(504).json({
      error:
        'Copilot request timed out. Architecture Review can take several minutes — wait and retry. Increase GROVE_CHAT_TIMEOUT_MS if needed.',
    });
    return;
  }
  if (/not configured/i.test(message)) {
    res.status(503).json({ error: message });
    return;
  }
  res.status(502).json({ error: message });
}

/** Headers required when Google Save to Drive fetches export URLs (same-origin or CORS). */
function applySaveToDriveCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Cache-Control, Content-Encoding, Content-Range, Content-Length, Accept-Ranges');
}

function sendArchitectureExport(req: import('express').Request, res: Response, token: string): void {
  const entry = readArchitectureExport(token);
  if (!entry) {
    applySaveToDriveCors(res);
    res.status(404).type('text/plain').send('Architecture review export expired or not found.');
    return;
  }

  applySaveToDriveCors(res);
  const buffer = Buffer.from(entry.content, 'utf8');
  const rangeHeader = req.headers.range;

  res.setHeader('Cache-Control', 'private, max-age=900');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  const asciiFilename = entry.filename.replace(/[^\x20-\x7E]+/g, '-').replace(/"/g, '') || 'architecture-review.md';
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"`);

  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', String(buffer.length));
    res.status(200).end();
    return;
  }

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : buffer.length - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end < buffer.length) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
        res.setHeader('Content-Length', String(end - start + 1));
        res.send(buffer.subarray(start, end + 1));
        return;
      }
    }
  }

  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}

/** Public download routes for Google Save to Drive (secured by short-lived UUID token). */
export function createArchitectureExportDownloadRouter(): Router {
  const router = Router();
  router.options('/architecture-export/:token', (_req, res) => {
    applySaveToDriveCors(res);
    res.status(204).end();
  });
  router.head('/architecture-export/:token', (req, res) => {
    sendArchitectureExport(req, res, String(req.params.token ?? '').trim());
  });
  router.get('/architecture-export/:token', (req, res) => {
    sendArchitectureExport(req, res, String(req.params.token ?? '').trim());
  });
  return router;
}

export function createCopilotRouter(): Router {
  const router = Router();
  const chatRateLimit = createCopilotRateLimitMiddleware('chat');
  const inspectRateLimit = createCopilotRateLimitMiddleware('inspect');

  router.get('/status', async (_req, res) => {
    const mongoInspectEnabled = isMongoMcpEnabled();
    const mongoInspectProbe = mongoInspectEnabled ? await probeMongoMcpAvailability() : { available: false };
    const googleDriveClientId = readGoogleDriveClientId();
    res.json({
      configured: isGroveConfigured(),
      model: process.env.GROVE_MODEL?.trim() || 'gpt-5.6-luna',
      mongoInspect: {
        enabled: mongoInspectEnabled,
        available: mongoInspectProbe.available,
        message: mongoInspectProbe.available ? undefined : mongoInspectProbe.message,
      },
      googleDrive: googleDriveClientId
        ? { enabled: true, clientId: googleDriveClientId }
        : { enabled: false },
    });
  });

  router.post('/mongo/vector-index', inspectRateLimit, async (req, res) => {
    try {
      const result = await createMongoAutoEmbedVectorIndex(req, req.body);
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      const identity = readCopilotAuditIdentity(req);
      auditCopilotEvent({
        kind: 'copilot.index',
        tenantId: identity.tenantId,
        userSub: identity.userSub,
        tool: 'createMongoAutoEmbedVectorIndex',
        ok: result.ok,
      });
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  router.post('/mongo/atlas-search-index', inspectRateLimit, async (req, res) => {
    try {
      const result = await createMongoAtlasSearchIndex(req, req.body);
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      const identity = readCopilotAuditIdentity(req);
      auditCopilotEvent({
        kind: 'copilot.index',
        tenantId: identity.tenantId,
        userSub: identity.userSub,
        tool: 'createMongoAtlasSearchIndex',
        ok: result.ok,
      });
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  router.post('/mongo/inspect', inspectRateLimit, async (req, res) => {
    try {
      const tool = String(req.body?.tool ?? '').trim();
      const args =
        req.body?.args && typeof req.body.args === 'object'
          ? (req.body.args as Record<string, unknown>)
          : {};

      if (!isMongoInspectToolName(tool)) {
        res.status(400).json({ error: `Unknown MongoDB inspect tool "${tool}".` });
        return;
      }

      const planContext = parseMongoPlanContext(req.body?.planContext);
      const identity = readCopilotAuditIdentity(req);

      const result = await invokeMongoInspectTool(req, tool, args, { planContext });
      auditCopilotEvent({
        kind: 'copilot.inspect',
        tenantId: identity.tenantId,
        userSub: identity.userSub,
        tool,
        ok: result.ok,
      });
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  router.post('/chat', chatRateLimit, async (req, res) => {
    req.socket.setTimeout(0);
    const identity = readCopilotAuditIdentity(req);
    const useSseStream = req.query.stream === '1' || req.body?.stream === true;
    let stopKeepalive: (() => void) | undefined;
    try {
      const messages = sanitizeCopilotChatMessages(req.body?.messages, {
        allowToolMessages: true,
        allowAssistantMessages: true,
      });
      const schemaContext = sanitizeCopilotSchemaContext(req.body?.schemaContext);
      const toolsEnabled = req.body?.toolsEnabled !== false;

      auditCopilotEvent({
        kind: 'copilot.chat',
        tenantId: identity.tenantId,
        userSub: identity.userSub,
        messageCount: messages.length,
        ok: true,
      });

      if (useSseStream) {
        beginCopilotChatSse(res);
        stopKeepalive = startCopilotChatSseKeepalive(res);
      }

      const result = await callGroveChat({ messages, schemaContext, toolsEnabled });

      if (useSseStream) {
        stopKeepalive?.();
        writeCopilotChatSseEvent(res, { event: 'message', data: result });
        writeCopilotChatSseEvent(res, { event: 'done', data: {} });
        res.end();
        return;
      }

      res.json(result);
    } catch (error) {
      stopKeepalive?.();
      if (error instanceof CopilotRequestValidationError) {
        auditCopilotEvent({
          kind: 'copilot.validation_failed',
          tenantId: identity.tenantId,
          userSub: identity.userSub,
          reason: error.message,
          ok: false,
        });
      }
      if (useSseStream && res.headersSent) {
        const message = error instanceof Error ? error.message : String(error);
        const statusMessage =
          /timed out|TimeoutError|AbortError/i.test(message)
            ? 'Copilot request timed out. Architecture Review can take several minutes — wait and retry.'
            : message;
        writeCopilotChatSseEvent(res, { event: 'error', data: { error: statusMessage } });
        res.end();
        return;
      }
      handleCopilotError(res, error, { sse: useSseStream });
    }
  });

  router.post('/architecture-export', (req, res) => {
    try {
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!isArchitectureReviewContent(content)) {
        res.status(400).json({ error: 'Content must be an Architecture Review response.' });
        return;
      }

      const filename =
        typeof req.body?.filename === 'string' && req.body.filename.trim()
          ? req.body.filename.trim()
          : architectureReviewFilename(content);

      const { token } = createArchitectureExport({ content, filename });
      res.json({
        token,
        filename,
        downloadPath: `/api/copilot/architecture-export/${token}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
