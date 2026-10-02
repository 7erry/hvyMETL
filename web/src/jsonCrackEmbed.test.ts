import { describe, expect, it } from 'vitest';
import {
  JSON_CRACK_IFRAME_ID,
  JSON_CRACK_ORIGIN,
  buildJsonCrackPostMessage,
  isJsonCrackReadyMessage,
} from './jsonCrackEmbed';

describe('jsonCrackEmbed', () => {
  it('builds postMessage payload for the widget', () => {
    const payload = buildJsonCrackPostMessage('{"name":"orders"}');
    expect(payload.json).toContain('orders');
    expect(payload.options.theme).toBe('dark');
    expect(payload.options.direction).toBe('RIGHT');
  });

  it('detects ready handshake from JSON Crack origin', () => {
    const ready = isJsonCrackReadyMessage(
      { origin: JSON_CRACK_ORIGIN, data: JSON_CRACK_IFRAME_ID } as MessageEvent,
      JSON_CRACK_IFRAME_ID,
    );
    expect(ready).toBe(true);

    const wrongOrigin = isJsonCrackReadyMessage(
      { origin: 'https://evil.example', data: JSON_CRACK_IFRAME_ID } as MessageEvent,
      JSON_CRACK_IFRAME_ID,
    );
    expect(wrongOrigin).toBe(false);
  });
});
