/**
 * Grove chat integration for the Release 4.0 sizing assistant.
 */

import { buildSizingAssistantSystemPrompt } from './sizingAssistantPrompt.js';
import { formatStudioSeedContextForPrompt } from './sizingAssistantStudioSeed.js';
import type { SizingAssistantStudioSeedPayload } from './sizingAssistantStudioSeed.js';
import { readGroveConfig, type CopilotChatMessage, type GroveConfig, type OpenAiToolCall } from './groveChat.js';
import { appendChatMessages, getSizingSession, touchSession } from './sizingAssistantSession.js';
import { SIZING_ASSISTANT_OPENAI_TOOLS } from './sizingAssistantToolSchemas.js';
import { executeSizingAssistantTool } from './sizingAssistantTools.js';
import {
  formatSizingToolResultForAssistant,
  sanitizeAssistantContent,
} from './sizingAssistantPresentation.js';

export type SizingAssistantChatRequest = {
  sessionId: string;
  messages: CopilotChatMessage[];
  maxToolRounds?: number;
  /** Optional studio context echoed on each turn for the LLM (parameters are already on the session). */
  studioSeed?: SizingAssistantStudioSeedPayload;
};

export type SizingAssistantChatResponse = {
  sessionId: string;
  message: CopilotChatMessage;
  finishReason: string | null;
  toolResults: Array<{ tool: string; ok: boolean; summary: string }>;
  parameters: Record<string, unknown>;
};

type OpenAiCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
};

async function callGroveSizingCompletion(
  messages: CopilotChatMessage[],
  config: GroveConfig,
  studioSeedContext?: string,
): Promise<{ message: CopilotChatMessage; finishReason: string | null }> {
  const systemPrompt = buildSizingAssistantSystemPrompt();
  const systemContent = studioSeedContext
    ? `${systemPrompt}\n\n## Studio pre-load\n${studioSeedContext}`
    : systemPrompt;
  const payload = {
    model: config.model,
    messages: [{ role: 'system', content: systemContent }, ...messages],
    tools: SIZING_ASSISTANT_OPENAI_TOOLS,
    tool_choice: 'auto' as const,
  };

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as OpenAiCompletionResponse;
  if (!response.ok) {
    const message = body.error?.message ?? response.statusText;
    throw new Error(`Grove API error (${response.status}): ${message}`);
  }

  const choice = body.choices?.[0];
  const assistant = choice?.message;
  if (!assistant) {
    throw new Error('Grove API returned no assistant message.');
  }

  return {
    message: {
      role: 'assistant',
      content: assistant.content ?? '',
      tool_calls: assistant.tool_calls,
    },
    finishReason: choice.finish_reason ?? null,
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

/**
 * Run a sizing assistant chat turn with server-side tool execution loop.
 */
export async function runSizingAssistantChat(
  request: SizingAssistantChatRequest,
  config?: GroveConfig | null,
): Promise<SizingAssistantChatResponse> {
  const grove = config ?? readGroveConfig();
  if (!grove) {
    throw new Error('Grove copilot is not configured. Set GROVE_API_KEY in .env.');
  }

  const session = getSizingSession(request.sessionId);
  if (!session) {
    throw new Error(`Sizing session not found: ${request.sessionId}`);
  }

  const maxRounds = request.maxToolRounds ?? 6;
  const conversation: CopilotChatMessage[] = [...request.messages];
  const toolResults: Array<{ tool: string; ok: boolean; summary: string }> = [];
  const studioSeedContext = request.studioSeed
    ? formatStudioSeedContextForPrompt(request.studioSeed)
    : undefined;

  appendChatMessages(session, request.messages);

  let lastMessage: CopilotChatMessage = { role: 'assistant', content: '' };
  let finishReason: string | null = 'stop';

  for (let round = 0; round < maxRounds; round += 1) {
    const completion = await callGroveSizingCompletion(conversation, grove, studioSeedContext);
    lastMessage = completion.message;
    finishReason = completion.finishReason;

    conversation.push(lastMessage);
    appendChatMessages(session, [lastMessage]);

    const toolCalls = lastMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    for (const call of toolCalls) {
      const toolName = call.function.name;
      const args = parseToolArguments(call.function.arguments);
      const result = executeSizingAssistantTool(request.sessionId, toolName, args);
      toolResults.push({ tool: toolName, ok: result.ok, summary: result.summary });

      const toolMessage: CopilotChatMessage = {
        role: 'tool',
        tool_call_id: call.id,
        content: formatSizingToolResultForAssistant(result),
      };
      conversation.push(toolMessage);
      appendChatMessages(session, [toolMessage]);
    }
  }

  const refreshed = getSizingSession(request.sessionId);
  if (lastMessage.content) {
    lastMessage = {
      ...lastMessage,
      content: sanitizeAssistantContent(lastMessage.content),
    };
    touchSession(refreshed ?? session);
  }

  return {
    sessionId: request.sessionId,
    message: lastMessage,
    finishReason,
    toolResults,
    parameters: refreshed?.parameters ?? session.parameters,
  };
}

/** Returns whether Grove is configured for sizing assistant chat. */
export function isSizingAssistantConfigured(): boolean {
  return readGroveConfig() !== null;
}
