import { describe, expect, it } from 'vitest';
import { readCopilotChatSseResponse } from './copilotChatStream.js';

describe('readCopilotChatSseResponse', () => {
  it('parses message and done SSE events into a Grove chat response', async () => {
    const body = [
      ': keepalive\n\n',
      'event: message\n',
      'data: {"message":{"role":"assistant","content":"Hello"},"finishReason":"stop"}\n\n',
      'event: done\n',
      'data: {}\n\n',
    ].join('');

    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });

    const result = await readCopilotChatSseResponse(response);
    expect(result.message.content).toBe('Hello');
    expect(result.finishReason).toBe('stop');
  });

  it('throws on error SSE events', async () => {
    const body = 'event: error\ndata: {"error":"Copilot request timed out."}\n\n';
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });

    await expect(readCopilotChatSseResponse(response)).rejects.toThrow('Copilot request timed out.');
  });
});
