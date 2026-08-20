/**
 * Phase 0 guardrails for Copilot and sizing-assistant LLM API requests.
 */

import type { CopilotChatMessage, CopilotSchemaContext } from './groveChat.js';

export const COPILOT_MAX_MESSAGES = 50;
/** Max user message size (prompt injection / abuse guard). */
export const COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS = 16_384;
/** Architecture Review assistant replies can be long; allow multi-section markdown in history. */
export const COPILOT_MAX_ASSISTANT_MESSAGE_CONTENT_CHARS = 131_072;
/** Tool payloads are truncated when over this size so inspect loops stay valid. */
export const COPILOT_MAX_TOOL_MESSAGE_CONTENT_CHARS = 32_768;
/** @deprecated Use role-specific limits; kept for tests and docs referencing the user cap. */
export const COPILOT_MAX_MESSAGE_CONTENT_CHARS = COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS;
export const COPILOT_MAX_TOTAL_CONTENT_CHARS = 512_000;
export const COPILOT_MAX_SCHEMA_TABLES = 500;
export const COPILOT_MAX_SCHEMA_RELATIONSHIPS = 2_000;
export const COPILOT_MAX_SCHEMA_GUARDRAIL_ISSUES = 200;
export const COPILOT_MAX_SCHEMA_COLLECTIONS = 500;
export const COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS = 512;
export const COPILOT_MAX_OVERRIDE_KEYS = 500;

export type CopilotChatSanitizeOptions = {
  /** Copilot tool loop sends assistant/tool turns; sizing chat accepts user/assistant only. */
  allowToolMessages: boolean;
  /** Sizing chat allows prior assistant prose from the UI thread. */
  allowAssistantMessages: boolean;
};

export class CopilotRequestValidationError extends Error {
  readonly statusCode: 400 | 413;

  constructor(message: string, statusCode: 400 | 413 = 400) {
    super(message);
    this.name = 'CopilotRequestValidationError';
    this.statusCode = statusCode;
  }
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function maxContentCharsForRole(role: CopilotChatMessage['role']): number {
  if (role === 'assistant') return COPILOT_MAX_ASSISTANT_MESSAGE_CONTENT_CHARS;
  if (role === 'tool') return COPILOT_MAX_TOOL_MESSAGE_CONTENT_CHARS;
  return COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS;
}

function normalizeMessageContent(role: CopilotChatMessage['role'], content: string): string {
  const maxChars = maxContentCharsForRole(role);
  if (content.length <= maxChars) return content;
  if (role === 'tool') {
    return truncateString(content, maxChars);
  }
  throw new CopilotRequestValidationError(
    `Message content exceeds ${maxChars} characters.`,
    413,
  );
}

/** Validates OpenAI-style tool call ids from client-supplied assistant messages. */
function collectToolCallIds(message: CopilotChatMessage): Set<string> {
  const ids = new Set<string>();
  for (const call of message.tool_calls ?? []) {
    const id = call?.id?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Sanitize and validate chat messages from the client.
 * Rejects forged system roles and orphan tool messages.
 */
export function sanitizeCopilotChatMessages(
  raw: unknown,
  options: CopilotChatSanitizeOptions,
): CopilotChatMessage[] {
  if (!Array.isArray(raw)) {
    throw new CopilotRequestValidationError('messages must be an array.');
  }
  if (raw.length > COPILOT_MAX_MESSAGES) {
    throw new CopilotRequestValidationError(
      `messages exceeds the ${COPILOT_MAX_MESSAGES}-message limit.`,
      413,
    );
  }

  const messages: CopilotChatMessage[] = [];
  let totalChars = 0;
  let pendingToolCallIds: Set<string> | null = null;

  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const role = record.role;
    if (role === 'system') {
      throw new CopilotRequestValidationError('System messages are not allowed from clients.');
    }
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') {
      continue;
    }

    if (role === 'tool' && !options.allowToolMessages) {
      throw new CopilotRequestValidationError('Tool messages are not allowed on this endpoint.');
    }
    if (role === 'assistant' && !options.allowAssistantMessages) {
      throw new CopilotRequestValidationError('Assistant messages are not allowed on this endpoint.');
    }

    const rawContent = typeof record.content === 'string' ? record.content : '';
    const content = normalizeMessageContent(role, rawContent);
    totalChars += content.length;
    if (totalChars > COPILOT_MAX_TOTAL_CONTENT_CHARS) {
      throw new CopilotRequestValidationError(
        `Total message content exceeds ${COPILOT_MAX_TOTAL_CONTENT_CHARS} characters.`,
        413,
      );
    }

    if (role === 'user') {
      if (pendingToolCallIds && pendingToolCallIds.size > 0) {
        throw new CopilotRequestValidationError(
          'User message cannot appear before all tool responses are supplied.',
        );
      }
      pendingToolCallIds = null;
      messages.push({ role: 'user', content });
      continue;
    }

    if (role === 'assistant') {
      if (pendingToolCallIds && pendingToolCallIds.size > 0) {
        throw new CopilotRequestValidationError(
          'Assistant message cannot appear before all tool responses are supplied.',
        );
      }
      const toolCalls = Array.isArray(record.tool_calls)
        ? (record.tool_calls as CopilotChatMessage['tool_calls'])
        : undefined;
      const nextPending = collectToolCallIds({ role: 'assistant', content, tool_calls: toolCalls });
      pendingToolCallIds = nextPending.size > 0 ? nextPending : null;
      messages.push({
        role: 'assistant',
        content,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    const toolCallId = typeof record.tool_call_id === 'string' ? record.tool_call_id.trim() : '';
    if (!toolCallId || !pendingToolCallIds?.has(toolCallId)) {
      throw new CopilotRequestValidationError('Tool message does not match a pending tool call.');
    }
    pendingToolCallIds.delete(toolCallId);
    if (pendingToolCallIds.size === 0) {
      pendingToolCallIds = null;
    }
    messages.push({
      role: 'tool',
      content,
      tool_call_id: toolCallId,
    });
  }

  if (pendingToolCallIds && pendingToolCallIds.size > 0) {
    throw new CopilotRequestValidationError('Conversation ends with unresolved tool calls.');
  }

  if (options.allowToolMessages) {
    if (!messages.some((message) => message.role === 'user' || message.role === 'tool')) {
      throw new CopilotRequestValidationError('At least one user or tool message is required.');
    }
  } else if (!messages.some((message) => message.role === 'user')) {
    throw new CopilotRequestValidationError('At least one user message is required.');
  }

  return messages;
}

function capRecordKeys<T extends Record<string, unknown>>(record: T, maxKeys: number): T {
  const keys = Object.keys(record);
  if (keys.length <= maxKeys) return record;
  return Object.fromEntries(keys.slice(0, maxKeys).map((key) => [key, record[key]])) as T;
}

function parseDatasetScale(raw: unknown): CopilotSchemaContext['datasetScale'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  const rawDataSource = body.rawDataSource;
  if (rawDataSource !== 'manager-override' && rawDataSource !== 'schema-estimate' && rawDataSource !== 'unavailable') {
    return undefined;
  }
  const shardingRecommendations = Array.isArray(body.shardingRecommendations)
    ? body.shardingRecommendations
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .slice(0, 50)
        .map((item) => ({
          collectionName: truncateString(String(item.collectionName ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          strategy: truncateString(String(item.strategy ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          shardKeySummary: truncateString(String(item.shardKeySummary ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          rationale: truncateString(String(item.rationale ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          estimatedHotStorageGb: Number(item.estimatedHotStorageGb ?? 0),
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
    workloadLabel:
      typeof body.workloadLabel === 'string'
        ? truncateString(body.workloadLabel.trim(), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS)
        : null,
    growthRatePercent: typeof body.growthRatePercent === 'number' ? body.growthRatePercent : null,
    recommendedTierLabel:
      typeof body.recommendedTierLabel === 'string'
        ? truncateString(body.recommendedTierLabel.trim(), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS)
        : null,
    requiresSharding: body.requiresSharding === true,
    shardingRecommendations,
  };
}

/** Bound and sanitize client-supplied schema context before Grove system prompt assembly. */
export function sanitizeCopilotSchemaContext(raw: unknown): CopilotSchemaContext {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const tables = Array.isArray(body.tables)
    ? body.tables.slice(0, COPILOT_MAX_SCHEMA_TABLES).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          name: truncateString(String(row.name ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          columnCount: Number(row.columnCount ?? 0),
          ...(typeof row.rowCount === 'number' ? { rowCount: row.rowCount } : {}),
        };
      })
    : [];

  const relationships = Array.isArray(body.relationships)
    ? body.relationships.slice(0, COPILOT_MAX_SCHEMA_RELATIONSHIPS).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          childTable: truncateString(String(row.childTable ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          parentTable: truncateString(String(row.parentTable ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          isBounded: row.isBounded === true,
          ...(typeof row.maxChildrenPerParent === 'number'
            ? { maxChildrenPerParent: row.maxChildrenPerParent }
            : {}),
        };
      })
    : [];

  const guardrailIssues = Array.isArray(body.guardrailIssues)
    ? body.guardrailIssues.slice(0, COPILOT_MAX_SCHEMA_GUARDRAIL_ISSUES).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          tableName: truncateString(String(row.tableName ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          label: truncateString(String(row.label ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          detail: truncateString(String(row.detail ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          severity: truncateString(String(row.severity ?? ''), 64),
        };
      })
    : [];

  const cardinalityOverrides =
    body.cardinalityOverrides && typeof body.cardinalityOverrides === 'object'
      ? capRecordKeys(body.cardinalityOverrides as Record<string, number>, COPILOT_MAX_OVERRIDE_KEYS)
      : {};

  const forceEmbedOverrides =
    body.forceEmbedOverrides && typeof body.forceEmbedOverrides === 'object'
      ? capRecordKeys(body.forceEmbedOverrides as Record<string, boolean>, COPILOT_MAX_OVERRIDE_KEYS)
      : {};

  const collections = Array.isArray(body.collections)
    ? body.collections.slice(0, COPILOT_MAX_SCHEMA_COLLECTIONS).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          name: truncateString(String(row.name ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
          sourceTable: truncateString(String(row.sourceTable ?? ''), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS),
        };
      })
    : undefined;

  const targetDatabase =
    typeof body.targetDatabase === 'string'
      ? truncateString(body.targetDatabase.trim(), COPILOT_MAX_SCHEMA_STRING_FIELD_CHARS)
      : undefined;

  return {
    tables,
    relationships,
    guardrailIssues,
    cardinalityOverrides,
    forceEmbedOverrides,
    collections,
    datasetScale: parseDatasetScale(body.datasetScale),
    targetDatabase,
    vectorSearchIndexes: Array.isArray(body.vectorSearchIndexes)
      ? (body.vectorSearchIndexes as CopilotSchemaContext['vectorSearchIndexes'])
      : undefined,
    atlasSearchIndexes: Array.isArray(body.atlasSearchIndexes)
      ? (body.atlasSearchIndexes as CopilotSchemaContext['atlasSearchIndexes'])
      : undefined,
    searchFieldHints: Array.isArray(body.searchFieldHints)
      ? body.searchFieldHints.slice(0, 500) as CopilotSchemaContext['searchFieldHints']
      : undefined,
  };
}

export type CopilotAuditEvent = {
  kind: 'copilot.chat' | 'copilot.inspect' | 'copilot.index' | 'sizing.chat' | 'copilot.validation_failed';
  tenantId?: string | null;
  userSub?: string | null;
  tool?: string;
  messageCount?: number;
  ok?: boolean;
  reason?: string;
};

/** Structured audit log for copilot LLM and inspect activity (no message bodies). */
export function auditCopilotEvent(event: CopilotAuditEvent): void {
  const payload = {
    ts: new Date().toISOString(),
    component: 'copilot-guard',
    ...event,
  };
  console.info(JSON.stringify(payload));
}
