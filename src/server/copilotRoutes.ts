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
import type { CopilotDatasetScaleContext } from '../copilot/copilotDatasetScale.js';

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

function parseDatasetScale(raw: unknown): CopilotDatasetScaleContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  const rawDataSource = body.rawDataSource;
  if (rawDataSource !== 'manager-override' && rawDataSource !== 'schema-estimate' && rawDataSource !== 'unavailable') {
    return undefined;
  }
  const shardingRecommendations = Array.isArray(body.shardingRecommendations)
    ? body.shardingRecommendations
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((item) => ({
          collectionName: String(item.collectionName ?? ''),
          strategy: String(item.strategy ?? ''),
          shardKeySummary: String(item.shardKeySummary ?? ''),
          estimatedHotStorageGb: Number(item.estimatedHotStorageGb ?? 0),
          rationale: String(item.rationale ?? ''),
        }))
        .filter((item) => item.collectionName.length > 0)
    : [];

  return {
    rawDataSource,
    managerRawDataGb: typeof body.managerRawDataGb === 'number' ? body.managerRawDataGb : null,
    rawDataGb: typeof body.rawDataGb === 'number' ? body.rawDataGb : null,
    totalStorageGb: typeof body.totalStorageGb === 'number' ? body.totalStorageGb : null,
    activeStorageGb: typeof body.activeStorageGb === 'number' ? body.activeStorageGb : null,
    archiveStorageGb: typeof body.archiveStorageGb === 'number' ? body.archiveStorageGb : null,
    estimatedTotalRows: typeof body.estimatedTotalRows === 'number' ? body.estimatedTotalRows : null,
    averageDocumentBytes: typeof body.averageDocumentBytes === 'number' ? body.averageDocumentBytes : null,
    workloadLabel: typeof body.workloadLabel === 'string' ? body.workloadLabel : null,
    growthRatePercent: typeof body.growthRatePercent === 'number' ? body.growthRatePercent : null,
    recommendedTierLabel: typeof body.recommendedTierLabel === 'string' ? body.recommendedTierLabel : null,
    requiresSharding: body.requiresSharding === true,
    shardingRecommendations,
  };
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
    datasetScale: parseDatasetScale(body.datasetScale),
    targetDatabase: typeof body.targetDatabase === 'string' ? body.targetDatabase.trim() : undefined,
    vectorSearchIndexes: Array.isArray(body.vectorSearchIndexes)
      ? (body.vectorSearchIndexes as CopilotSchemaContext['vectorSearchIndexes'])
      : undefined,
    atlasSearchIndexes: Array.isArray(body.atlasSearchIndexes)
      ? (body.atlasSearchIndexes as CopilotSchemaContext['atlasSearchIndexes'])
      : undefined,
    searchFieldHints: Array.isArray(body.searchFieldHints)
      ? (body.searchFieldHints as CopilotSchemaContext['searchFieldHints'])
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

  router.post('/mongo/vector-index', async (req, res) => {
    try {
      const result = await createMongoAutoEmbedVectorIndex(req, req.body);
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  router.post('/mongo/atlas-search-index', async (req, res) => {
    try {
      const result = await createMongoAtlasSearchIndex(req, req.body);
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
  });

  router.post('/mongo/inspect', async (req, res) => {
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

      const result = await invokeMongoInspectTool(req, tool, args, { planContext });
      const status = result.serviceUnavailable ? 503 : result.ok ? 200 : 400;
      res.status(status).json(result);
    } catch (error) {
      handleCopilotError(res, error);
    }
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
