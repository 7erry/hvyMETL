import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildCopilotSystemPrompt } from './copilotPrompt.js';
import { callGroveChat, isGroveConfigured, readGroveConfig } from './groveChat.js';

describe('buildCopilotSystemPrompt (groveChat)', () => {
  it('includes table and guardrail context', () => {
    const prompt = buildCopilotSystemPrompt({
      tables: [{ name: 'trips', columnCount: 3, rowCount: 100 }],
      relationships: [
        { childTable: 'train_telemetry', parentTable: 'trips', isBounded: false, maxChildrenPerParent: 0 },
      ],
      guardrailIssues: [
        {
          tableName: 'train_telemetry',
          label: 'Unbounded Array',
          detail: 'High volume child',
          severity: 'warning',
        },
      ],
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
    });
    expect(prompt).toContain('trips');
    expect(prompt).toContain('train_telemetry');
    expect(prompt).toContain('Unbounded Array');
    expect(prompt).toContain('Subset');
    expect(prompt).toContain('<details>');
  });
});

describe('groveChat', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, GROVE_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('detects configuration from env', () => {
    expect(isGroveConfigured()).toBe(true);
    expect(readGroveConfig()?.model).toBe('gpt-5.6-luna');
  });

  it('calls Grove chat completions with api-key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: 'Hello from Grove.' },
            finish_reason: 'stop',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callGroveChat({
      messages: [{ role: 'user', content: 'Hi' }],
      schemaContext: {
        tables: [],
        relationships: [],
        guardrailIssues: [],
        cardinalityOverrides: {},
        forceEmbedOverrides: {},
      },
    });

    expect(result.message.content).toBe('Hello from Grove.');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
  });
});
