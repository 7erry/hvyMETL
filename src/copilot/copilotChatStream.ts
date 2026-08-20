import type { Response as ExpressResponse } from 'express';
import type { GroveChatResponse } from './groveChat.js';

export const COPILOT_CHAT_SSE_KEEPALIVE_MS = 10_000;

export type CopilotChatSseEvent =
  | { event: 'message'; data: GroveChatResponse }
  | { event: 'error'; data: { error: string } }
  | { event: 'done'; data: Record<string, never> };

/** Begin an SSE response with nginx-friendly no-buffer headers. */
export function beginCopilotChatSse(res: ExpressResponse): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function writeCopilotChatSseEvent(res: ExpressResponse, payload: CopilotChatSseEvent): void {
  res.write(`event: ${payload.event}\n`);
  res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
}

/** Sends comment keepalives so hosted reverse proxies do not 504 during long Grove calls. */
export function startCopilotChatSseKeepalive(res: ExpressResponse, intervalMs = COPILOT_CHAT_SSE_KEEPALIVE_MS): () => void {
  const timer = setInterval(() => {
    res.write(': keepalive\n\n');
  }, intervalMs);
  return () => clearInterval(timer);
}

/** Parse SSE body from POST /api/copilot/chat?stream=1 into a Grove chat response. */
export async function readCopilotChatSseResponse(response: globalThis.Response): Promise<GroveChatResponse> {
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) throw new Error(parsed.error);
    } catch (error) {
      if (error instanceof Error && error.message !== text) throw error;
    }
    throw new Error(text.trim() || `Copilot stream failed (HTTP ${response.status}).`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Copilot stream returned no response body.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: GroveChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      if (!rawEvent.trim() || rawEvent.startsWith(':')) continue;

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (!dataLines.length) continue;

      const payload = JSON.parse(dataLines.join('\n')) as unknown;
      if (eventName === 'error') {
        const error = (payload as { error?: string }).error ?? 'Copilot stream failed.';
        throw new Error(error);
      }
      if (eventName === 'message') {
        result = payload as GroveChatResponse;
      }
    }
  }

  if (!result) {
    throw new Error('Copilot stream ended without a message event.');
  }
  return result;
}
