/**
 * Sizing assistant tool handlers (Release 4.0 Phase 2).
 */

import {
  findOptimalClusterTier,
  toPublicRecommendations,
} from './sizingEngine.js';
import {
  getSizingSession,
  mergeSessionParameters,
  resetSizingSession,
  setResourceCuratorHandoff,
  touchSession,
} from './sizingAssistantSession.js';
import type { SizingAssistantToolName } from './sizingAssistantToolSchemas.js';
import { isSizingAssistantToolName } from './sizingAssistantToolSchemas.js';
import type { SizingAssistantSession, SizingSessionParameters } from './sizingAssistantTypes.js';
import { REQUIRED_SIZING_ENGINE_FIELDS } from './sizingAssistantTypes.js';
import {
  countPresentRequiredFields,
  parseSizingParameterUpdate,
} from './sizingAssistantParameterParse.js';

export type SizingToolResult = {
  ok: boolean;
  tool: SizingAssistantToolName;
  summary: string;
  data?: Record<string, unknown>;
};

function requireSession(sessionId: string): SizingAssistantSession {
  const session = getSizingSession(sessionId);
  if (!session) {
    throw new Error(`Sizing session not found: ${sessionId}`);
  }
  if (session.aborted) {
    throw new Error('Sizing session was aborted. Create a new session to continue.');
  }
  return session;
}

function pickNumericFields(args: Record<string, unknown>): Partial<SizingSessionParameters> {
  return parseSizingParameterUpdate(args);
}

function latestUserMessageText(session: SizingAssistantSession): string {
  const userMessages = session.chatMessages.filter((message) => message.role === 'user');
  if (userMessages.length === 0) return '';
  return userMessages
    .slice(-3)
    .map((message) => message.content)
    .join('\n');
}

/** Fill missing required fields from recent user chat text when the model used wrong tool arg shapes. */
function supplementParametersFromChat(session: SizingAssistantSession): SizingAssistantSession {
  const missing = listMissingSizingParameters(session);
  if (missing.length === 0) return session;

  const sources = [latestUserMessageText(session)].filter(Boolean);

  let patch: Partial<SizingSessionParameters> = {};
  for (const text of sources) {
    patch = { ...patch, ...extractParametersFromText(text) };
  }

  const filtered: Partial<SizingSessionParameters> = {};
  for (const field of missing) {
    const value = patch[field];
    if (typeof value === 'number' && value > 0) {
      Object.assign(filtered, { [field]: value });
    }
  }

  if (Object.keys(filtered).length === 0) return session;
  return mergeSessionParameters(session, filtered);
}

/** Heuristic extraction from unstructured transcript text. */
export function extractParametersFromText(text: string): Partial<SizingSessionParameters> {
  const patch: Partial<SizingSessionParameters> = {};
  const lower = text.toLowerCase();

  const dataMatch =
    text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:gb|gib)\b/i) ??
    lower.match(/data[^0-9]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*gb/);
  if (dataMatch) {
    patch.projected_total_data_size_gb = Number.parseFloat(dataMatch[1].replace(/,/g, ''));
  }

  const readMatch =
    text.match(/peak\s+reads?\s*(?:is|:)?\s*(\d{1,3}(?:,\d{3})*|\d+)/i) ??
    text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:reads?|qps|rps|qts)\b/i) ??
    text.match(/read[^0-9]*(\d{1,3}(?:,\d{3})*|\d+)/i);
  if (readMatch) {
    patch.total_raw_read_ops = Number.parseInt(readMatch[1].replace(/,/g, ''), 10);
  }

  const writeMatch =
    text.match(/peak\s+writes?\s*(?:is|:)?\s*(\d{1,3}(?:,\d{3})*|\d+)/i) ??
    text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:writes?|tps|wps)\b/i) ??
    text.match(/write[^0-9]*(\d{1,3}(?:,\d{3})*|\d+)/i);
  if (writeMatch) {
    patch.total_raw_write_ops = Number.parseInt(writeMatch[1].replace(/,/g, ''), 10);
  }

  const docMatch =
    text.match(/average\s+document\s+size\s*(?:is|:)?\s*(\d+(?:\.\d+)?)\s*(?:kb|kilobyte)?/i) ??
    text.match(/(\d+(?:\.\d+)?)\s*(?:kb|kilobyte)\b/i);
  if (docMatch) patch.avg_doc_size_kb = Number.parseFloat(docMatch[1]);

  if (/bulk\s*ops/i.test(text) || /bulk\s*write/i.test(text)) {
    patch.is_bulk_ops_permitted = true;
  }
  if (/multi[- ]region/i.test(text)) {
    patch.is_multi_region_required_for_ha = true;
  }
  if (/\bintermittent\b/i.test(text)) {
    patch.workload_type = 'INTERMITTENT';
  }

  const workingSetMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:total\s*)?data/i);
  if (workingSetMatch) {
    patch.active_working_set_percentage = Number.parseFloat(workingSetMatch[1]) / 100;
  }

  return patch;
}

export function listMissingSizingParameters(
  session: SizingAssistantSession,
): Array<(typeof REQUIRED_SIZING_ENGINE_FIELDS)[number]> {
  return REQUIRED_SIZING_ENGINE_FIELDS.filter((field) => {
    const value = session.parameters[field];
    return value === undefined || value === null || (typeof value === 'number' && value <= 0);
  });
}

export function buildMissingInfoPrompt(missing: Array<(typeof REQUIRED_SIZING_ENGINE_FIELDS)[number]>): string {
  const questions: Record<string, string> = {
    projected_total_data_size_gb: 'What is the projected total cluster data size in GB?',
    total_raw_read_ops: 'What are peak raw read operations per second (QPS)?',
    total_raw_write_ops: 'What are peak raw write operations per second (TPS)?',
    avg_doc_size_kb: 'What is the average document size in KB?',
  };
  return missing.map((field) => questions[field] ?? `Please provide ${field}.`).join('\n');
}

/** Execute one sizing assistant tool against a session. */
export function executeSizingAssistantTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): SizingToolResult {
  if (!isSizingAssistantToolName(toolName)) {
    throw new Error(`Unknown sizing assistant tool "${toolName}".`);
  }

  let session = requireSession(sessionId);

  switch (toolName) {
    case 'update_sizing_parameters': {
      let session = requireSession(sessionId);
      const patch = pickNumericFields(args);
      if (typeof args.source_text === 'string' && args.source_text.trim()) {
        Object.assign(patch, extractParametersFromText(args.source_text));
      }
      session = mergeSessionParameters(session, patch);
      session = supplementParametersFromChat(session);
      const missing = listMissingSizingParameters(session);
      const requiredCount = countPresentRequiredFields(session.parameters);
      return {
        ok: true,
        tool: toolName,
        summary: `Updated ${Object.keys(patch).length} sizing parameter(s); ${requiredCount}/4 required fields set.`,
        data: {
          parameters: session.parameters,
          missingFields: missing,
          appliedKeys: Object.keys(patch),
        },
      };
    }
    case 'update_shard_penalty': {
      const multiplier = args.shard_penalty_multiplier;
      if (typeof multiplier !== 'number' || multiplier < 1) {
        throw new Error('shard_penalty_multiplier must be a number >= 1.0');
      }
      session.shardPenaltyMultiplier = multiplier;
      session = mergeSessionParameters(session, { shard_penalty_multiplier: multiplier });
      return {
        ok: true,
        tool: toolName,
        summary: `Shard penalty multiplier set to ${multiplier}.`,
        data: { shard_penalty_multiplier: session.shardPenaltyMultiplier },
      };
    }
    case 'abort_sizing_process': {
      session = resetSizingSession(session);
      return {
        ok: true,
        tool: toolName,
        summary: 'Sizing process aborted and session state cleared.',
        data: { aborted: true, sessionId: session.sessionId },
      };
    }
    case 'handoff_to_resource_curator': {
      session = setResourceCuratorHandoff(session, 'pending');
      return {
        ok: true,
        tool: toolName,
        summary: 'Resource Curator handoff marked pending.',
        data: {
          handoffStatus: session.resourceCuratorHandoff,
          curatorPayload: {
            sessionId: session.sessionId,
            reason: typeof args.reason === 'string' ? args.reason : 'User requested resource re-selection',
            parametersSnapshot: session.parameters,
          },
        },
      };
    }
    case 'get_session_transcripts': {
      return {
        ok: true,
        tool: toolName,
        summary: `Found ${session.transcripts.length} transcript(s).`,
        data: {
          transcripts: session.transcripts.map(({ id, title, body }) => ({
            id,
            title,
            preview: body.slice(0, 240),
          })),
        },
      };
    }
    case 'extract_sizing_from_transcripts': {
      const ids = Array.isArray(args.transcript_ids)
        ? args.transcript_ids.filter((id): id is string => typeof id === 'string')
        : session.transcripts.map((item) => item.id);
      const selected = session.transcripts.filter((item) => ids.includes(item.id));
      let merged: Partial<SizingSessionParameters> = {};
      for (const transcript of selected) {
        merged = { ...merged, ...extractParametersFromText(transcript.body) };
      }
      session = mergeSessionParameters(session, merged);
      return {
        ok: true,
        tool: toolName,
        summary: `Extracted parameters from ${selected.length} transcript(s).`,
        data: { extracted: merged, parameters: session.parameters },
      };
    }
    case 'prompt_for_missing_info': {
      const missing = listMissingSizingParameters(session);
      const prompt = buildMissingInfoPrompt(missing);
      return {
        ok: true,
        tool: toolName,
        summary: missing.length === 0 ? 'All required parameters are present.' : 'Missing required parameters.',
        data: { missingFields: missing, questions: prompt },
      };
    }
    case 'find_optimal_cluster_tier': {
      session = supplementParametersFromChat(session);
      const missing = listMissingSizingParameters(session);
      if (missing.length > 0) {
        return {
          ok: false,
          tool: toolName,
          summary: 'Cannot run sizing until required parameters are provided.',
          data: {
            missingFields: missing,
            questions: buildMissingInfoPrompt(missing),
          },
        };
      }
      const engineInput = {
        ...session.parameters,
        shard_penalty_multiplier: session.shardPenaltyMultiplier,
      };
      const ranked = findOptimalClusterTier(engineInput);
      const recommendations = toPublicRecommendations(ranked);
      touchSession(session);
      return {
        ok: true,
        tool: toolName,
        summary:
          recommendations.length > 0
            ? `Top recommendation: ${recommendations[0].displayName} (${recommendations[0].shardCount} shard(s)).`
            : 'No eligible tier configurations matched the workload.',
        data: {
          recommendations,
          parametersUsed: recommendations[0]?.parametersUsed ?? engineInput,
        },
      };
    }
    default: {
      const exhaustive: never = toolName;
      throw new Error(`Unhandled tool ${exhaustive}`);
    }
  }
}

/** Attach or replace transcripts on a session (API helper). */
export function setSessionTranscripts(
  sessionId: string,
  transcripts: Array<{ id: string; title: string; body: string }>,
): SizingAssistantSession {
  const session = requireSession(sessionId);
  session.transcripts = transcripts.map((item) => ({ ...item }));
  if (session.resourceCuratorHandoff === 'pending') {
    session.resourceCuratorHandoff = 'completed';
  }
  return touchSession(session);
}
