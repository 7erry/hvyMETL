import { buildCopilotSystemPrompt } from './copilotPrompt.js';
import { COPILOT_OPENAI_TOOLS } from './agentToolSchemas.js';

const DEFAULT_GROVE_URL =
  'https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1/chat/completions';
const DEFAULT_GROVE_MODEL = 'gpt-5.6-luna';

export type CopilotChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type CopilotSchemaContext = {
  tables: { name: string; columnCount: number; rowCount?: number }[];
  relationships: {
    childTable: string;
    parentTable: string;
    isBounded: boolean;
    maxChildrenPerParent?: number;
  }[];
  guardrailIssues: {
    tableName: string;
    label: string;
    detail: string;
    severity: string;
  }[];
  cardinalityOverrides: Record<string, number>;
  forceEmbedOverrides: Record<string, boolean>;
  collections?: { name: string; sourceTable: string }[];
};

export type CopilotChatMessage = {
  role: CopilotChatRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

export type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type GroveChatRequest = {
  messages: CopilotChatMessage[];
  schemaContext: CopilotSchemaContext;
  toolsEnabled?: boolean;
};

export type GroveChatResponse = {
  message: CopilotChatMessage;
  finishReason: string | null;
};

export type GroveConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** Reads Grove API settings from environment variables. */
export function readGroveConfig(): GroveConfig | null {
  const apiKey = process.env.GROVE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.GROVE_API_URL?.trim() || DEFAULT_GROVE_URL,
    model: process.env.GROVE_MODEL?.trim() || DEFAULT_GROVE_MODEL,
  };
}

/** Returns whether the Grove copilot backend is configured. */
export function isGroveConfigured(): boolean {
  return readGroveConfig() !== null;
}

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

/** Calls the Grove OpenAI-compatible chat completions endpoint. */
export async function callGroveChat(request: GroveChatRequest, config?: GroveConfig): Promise<GroveChatResponse> {
  const grove = config ?? readGroveConfig();
  if (!grove) {
    throw new Error('Grove copilot is not configured. Set GROVE_API_KEY in .env.');
  }

  const systemPrompt = buildCopilotSystemPrompt(request.schemaContext);
  const payload: Record<string, unknown> = {
    model: grove.model,
    messages: [{ role: 'system', content: systemPrompt }, ...request.messages],
  };

  if (request.toolsEnabled !== false) {
    payload.tools = COPILOT_OPENAI_TOOLS;
    payload.tool_choice = 'auto';
  }

  const response = await fetch(grove.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': grove.apiKey,
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
