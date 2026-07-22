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

/** Parse JSON tool output from MCP content blocks. */
export function parseMongoMcpToolPayload(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const blocks = content as McpContentBlock[];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      try {
        return JSON.parse(block.text) as unknown;
      } catch {
        return { text: block.text };
      }
    }
  }
  return { content: blocks };
}

/** Connect to the MCP server, run one tool, and close the session. */
export async function callMongoMcpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const config = readMongoMcpConfig();
  if (!config.enabled) {
    throw new Error(MCP_INSPECT_UNAVAILABLE_MESSAGE);
  }

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
  });
  const client = new Client({ name: 'hvymetl-copilot', version: '1.9.0' });

  const abort = AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS);
  try {
    await client.connect(transport);
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
    return parseMongoMcpToolPayload(result.content);
  } finally {
    await client.close().catch(() => undefined);
  }
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
