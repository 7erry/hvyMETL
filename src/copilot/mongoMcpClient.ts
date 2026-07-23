/**
 * Streamable HTTP client for the co-hosted MongoDB MCP server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** User-facing message when the MCP inspect service cannot be reached. */
export const MCP_INSPECT_UNAVAILABLE_MESSAGE =
  'MongoDB inspect is not currently available. The inspection service may be down — please try again later.';

const DEFAULT_MCP_URL = 'http://127.0.0.1:3000/mcp';
const MCP_PROBE_TIMEOUT_MS = 8_000;
const MCP_TOOL_TIMEOUT_MS = 20_000;

export type MongoMcpConfig = {
  url: string;
  enabled: boolean;
  headers: Record<string, string>;
};

/** Read MongoDB MCP HTTP settings from environment. */
export function readMongoMcpConfig(): MongoMcpConfig {
  const url = process.env.HVYMETL_MCP_MONGODB_URL?.trim() || DEFAULT_MCP_URL;
  const enabled = process.env.HVYMETL_MCP_MONGODB_ENABLED !== '0';
  let headers: Record<string, string> = {};
  const rawHeaders = process.env.HVYMETL_MCP_MONGODB_HEADERS?.trim();
  if (rawHeaders) {
    try {
      const parsed: unknown = JSON.parse(rawHeaders);
      if (parsed && typeof parsed === 'object') {
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
      }
    } catch {
      // Ignore invalid header JSON; server-side logs can be added if needed.
    }
  }
  return { url, enabled, headers };
}

/** True when MongoDB inspect via MCP is enabled (default: on). */
export function isMongoMcpEnabled(): boolean {
  return readMongoMcpConfig().enabled;
}

type McpContentBlock = {
  type?: string;
  text?: string;
};

type McpToolCallResult = {
  content?: unknown;
  structuredContent?: Record<string, unknown>;
};

/** Prefer MCP structuredContent; fall back to parsing human-readable content blocks. */
export function extractMongoMcpToolPayload(result: McpToolCallResult): unknown {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  return parseMongoMcpToolPayload(result.content);
}

function tryParseJsonFromText(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // MongoDB MCP wraps JSON arrays inside untrusted-user-data tags.
  }

  const untrustedMatch = trimmed.match(
    /<untrusted-user-data-[^>]+>\s*([\s\S]*?)\s*<\/untrusted-user-data-[^>]+>/,
  );
  if (untrustedMatch?.[1]) {
    try {
      return JSON.parse(untrustedMatch[1].trim()) as unknown;
    } catch {
      // Continue scanning other blocks.
    }
  }

  const arrayStart = trimmed.indexOf('[{');
  if (arrayStart >= 0) {
    try {
      const candidate = trimmed.slice(arrayStart);
      const end = findMatchingJsonBracket(candidate, '[', ']');
      if (end >= 0) {
        return JSON.parse(candidate.slice(0, end + 1)) as unknown;
      }
    } catch {
      // Continue scanning other blocks.
    }
  }

  const objectStart = trimmed.indexOf('{"');
  if (objectStart >= 0) {
    try {
      const candidate = trimmed.slice(objectStart);
      const end = findMatchingJsonBracket(candidate, '{', '}');
      if (end >= 0) {
        return JSON.parse(candidate.slice(0, end + 1)) as unknown;
      }
    } catch {
      // Continue scanning other blocks.
    }
  }

  return undefined;
}

function findMatchingJsonBracket(text: string, open: string, close: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

/** Parse JSON tool output from MCP content blocks. */
export function parseMongoMcpToolPayload(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const blocks = content as McpContentBlock[];

  for (const block of blocks) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    const parsed = tryParseJsonFromText(block.text);
    if (parsed !== undefined) return parsed;
  }

  return { content: blocks };
}

/** Connect to the MCP server, run one tool, and close the session. */
export type MongoMcpToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

function normalizeMongoMcpError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/unexpected token.*[<']|is not valid json/i.test(message)) {
    return new Error(
      'MongoDB inspect returned an unexpected HTML response. The inspection service may be overloaded — try again in a moment.',
    );
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timed out|aborted/i.test(message)) {
    return new Error(MCP_INSPECT_UNAVAILABLE_MESSAGE);
  }
  return error instanceof Error ? error : new Error(message);
}

async function executeMongoMcpToolCall(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const abort = AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS);
  const result = await client.callTool({ name, arguments: args }, undefined, { signal: abort });
  if (result.isError) {
    const message =
      Array.isArray(result.content) &&
      result.content[0] &&
      typeof result.content[0] === 'object' &&
      'text' in result.content[0]
        ? String((result.content[0] as { text: string }).text)
        : `MongoDB MCP tool "${name}" failed.`;
    throw new Error(message);
  }
  return extractMongoMcpToolPayload({
    content: result.content,
    structuredContent:
      'structuredContent' in result &&
      result.structuredContent &&
      typeof result.structuredContent === 'object'
        ? (result.structuredContent as Record<string, unknown>)
        : undefined,
  });
}

/** Reuse one MCP session for multiple tool calls (avoids connection storms during collection enrichment). */
export async function withMongoMcpSession<T>(
  fn: (callTool: MongoMcpToolCaller) => Promise<T>,
): Promise<T> {
  const config = readMongoMcpConfig();
  if (!config.enabled) {
    throw new Error(MCP_INSPECT_UNAVAILABLE_MESSAGE);
  }

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
  });
  const client = new Client({ name: 'hvymetl-copilot', version: '1.9.0' });

  try {
    await client.connect(transport);
    const callTool: MongoMcpToolCaller = async (name, args) => {
      try {
        return await executeMongoMcpToolCall(client, name, args);
      } catch (error) {
        throw normalizeMongoMcpError(error);
      }
    };
    return await fn(callTool);
  } catch (error) {
    throw normalizeMongoMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function callMongoMcpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  return withMongoMcpSession((callTool) => callTool(name, args));
}

/** Lightweight availability probe for copilot status and graceful degradation. */
export async function probeMongoMcpAvailability(): Promise<{ available: boolean; message?: string }> {
  const config = readMongoMcpConfig();
  if (!config.enabled) {
    return {
      available: false,
      message: 'MongoDB inspect is disabled on this server.',
    };
  }

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
  });
  const client = new Client({ name: 'hvymetl-copilot-probe', version: '1.9.0' });
  const abort = AbortSignal.timeout(MCP_PROBE_TIMEOUT_MS);

  try {
    await client.connect(transport);
    await client.listTools(undefined, { signal: abort });
    return { available: true };
  } catch {
    return { available: false, message: MCP_INSPECT_UNAVAILABLE_MESSAGE };
  } finally {
    await client.close().catch(() => undefined);
  }
}
