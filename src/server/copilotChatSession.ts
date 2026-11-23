import { randomUUID } from 'node:crypto';
import { isCopilotMutatingTool } from '../copilot/copilotMutatingTools.js';
import {
  COPILOT_MAX_MESSAGES,
  COPILOT_MAX_TOOL_MESSAGE_CONTENT_CHARS,
  COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS,
  CopilotRequestValidationError,
} from '../copilot/copilotRequestGuard.js';
import type { CopilotChatMessage } from '../copilot/groveChat.js';

export type CopilotToolConfirmation = {
  confirmationId: string;
  toolCallId: string;
  tool: string;
};

type StoredConfirmation = CopilotToolConfirmation & { arguments: string };

type CopilotSession = {
  messages: CopilotChatMessage[];
  pendingToolCallIds: Set<string>;
  confirmations: Map<string, StoredConfirmation>;
  updatedAt: number;
};

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, CopilotSession>();

function sessionKey(userSub: string, sessionId: string): string {
  return `${userSub}\n${sessionId}`;
}

function loadSession(userSub: string, sessionId: string): CopilotSession {
  const id = sessionId.trim();
  if (!id || id.length > 80) {
    throw new CopilotRequestValidationError('sessionId is required.');
  }
  const key = sessionKey(userSub, id);
  const existing = sessions.get(key);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const fresh: CopilotSession = {
    messages: [],
    pendingToolCallIds: new Set(),
    confirmations: new Map(),
    updatedAt: Date.now(),
  };
  sessions.set(key, fresh);
  return fresh;
}

export function copilotSessionOwner(userSub: string | null): string {
  return userSub?.trim() || 'local-dev';
}

/** Append the new user turn or the tool results for the server's last assistant message. */
export function beginCopilotTurn(input: {
  userSub: string;
  sessionId: string;
  content?: string;
  toolResults?: { tool_call_id: string; content: string }[];
}): CopilotChatMessage[] {
  const session = loadSession(input.userSub, input.sessionId);
  const content = input.content?.trim() ?? '';
  const toolResults = input.toolResults ?? [];
  if (content && toolResults.length > 0) {
    throw new CopilotRequestValidationError('Send either a user message or tool results.');
  }
  if (!content && toolResults.length === 0) {
    throw new CopilotRequestValidationError('A user message or tool result is required.');
  }

  if (content) {
    if (session.pendingToolCallIds.size > 0) {
      throw new CopilotRequestValidationError('Tool results are required before the next user message.');
    }
    if (content.length > COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS) {
      throw new CopilotRequestValidationError(
        `Message content exceeds ${COPILOT_MAX_USER_MESSAGE_CONTENT_CHARS} characters.`,
        413,
      );
    }
    session.messages.push({ role: 'user', content });
  } else {
    for (const result of toolResults) {
      const toolCallId = result.tool_call_id.trim();
      if (!toolCallId || !session.pendingToolCallIds.has(toolCallId)) {
        throw new CopilotRequestValidationError('Tool message does not match a pending tool call.');
      }
      session.pendingToolCallIds.delete(toolCallId);
      for (const [id, record] of session.confirmations) {
        if (record.toolCallId === toolCallId) session.confirmations.delete(id);
      }
      const body =
        result.content.length > COPILOT_MAX_TOOL_MESSAGE_CONTENT_CHARS
          ? `${result.content.slice(0, COPILOT_MAX_TOOL_MESSAGE_CONTENT_CHARS)}…`
          : result.content;
      session.messages.push({ role: 'tool', content: body, tool_call_id: toolCallId });
    }
    if (session.pendingToolCallIds.size > 0) {
      throw new CopilotRequestValidationError('Conversation ends with unresolved tool calls.');
    }
  }

  if (session.messages.length > COPILOT_MAX_MESSAGES) {
    session.messages.splice(0, session.messages.length - COPILOT_MAX_MESSAGES);
  }
  session.updatedAt = Date.now();
  return session.messages.map((message) => ({
    ...message,
    tool_calls: message.tool_calls ? message.tool_calls.map((call) => ({ ...call })) : undefined,
  }));
}

/** Store the assistant reply the server received from Grove. Client history is not accepted. */
export function recordCopilotAssistantTurn(
  userSub: string,
  sessionId: string,
  message: CopilotChatMessage,
): CopilotToolConfirmation[] {
  const session = loadSession(userSub, sessionId);
  if (session.pendingToolCallIds.size > 0) {
    throw new CopilotRequestValidationError('Tool results are required before the next assistant turn.');
  }
  session.messages.push(message);
  session.pendingToolCallIds = new Set(
    (message.tool_calls ?? []).map((call) => call.id.trim()).filter(Boolean),
  );
  const confirmations: CopilotToolConfirmation[] = [];
  for (const call of message.tool_calls ?? []) {
    const tool = call.function?.name?.trim() ?? '';
    if (!isCopilotMutatingTool(tool)) continue;
    const confirmationId = randomUUID();
    const record: StoredConfirmation = {
      confirmationId,
      toolCallId: call.id,
      tool,
      arguments: call.function?.arguments ?? '',
    };
    session.confirmations.set(confirmationId, record);
    confirmations.push({ confirmationId, toolCallId: call.id, tool });
  }
  session.updatedAt = Date.now();
  return confirmations;
}

/** Mint a one-time id for an index create the user started (dialog or typed command). */
export function issueCopilotUserConfirmation(userSub: string, sessionId: string, tool: string): string {
  if (!isCopilotMutatingTool(tool)) {
    throw new CopilotRequestValidationError('Unknown tool.');
  }
  const session = loadSession(userSub, sessionId);
  const confirmationId = randomUUID();
  session.confirmations.set(confirmationId, {
    confirmationId,
    toolCallId: '',
    tool,
    arguments: '',
  });
  session.updatedAt = Date.now();
  return confirmationId;
}

/** One-time gate for an index route. The id was issued when Grove requested that tool. */
export function consumeCopilotConfirmation(
  userSub: string,
  sessionId: string,
  confirmationId: string,
  tool: string,
): void {
  const session = sessions.get(sessionKey(userSub, sessionId.trim()));
  const pending = session?.confirmations.get(confirmationId.trim());
  if (!pending || pending.tool !== tool) {
    throw new CopilotRequestValidationError('Confirmation is required before this change.');
  }
  session?.confirmations.delete(confirmationId.trim());
}
