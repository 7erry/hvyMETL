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
      datasetScale: {
        rawDataSource: 'manager-override',
        managerRawDataGb: 1024,
        rawDataGb: 1024,
        totalStorageGb: 1400,
        activeStorageGb: 1300,
        archiveStorageGb: 100,
        estimatedTotalRows: 20_000_000,
        averageDocumentBytes: 512,
        workloadLabel: 'Write-heavy',
        growthRatePercent: 15,
        recommendedTierLabel: 'M50',
        requiresSharding: false,
        shardingRecommendations: [],
      },
    });
    expect(prompt).toContain('trips');
    expect(prompt).toContain('train_telemetry');
    expect(prompt).toContain('Unbounded Array');
    expect(prompt).toContain('Manager dataset scale');
    expect(prompt).toContain('1 TB');
    expect(prompt).toContain('Subset');
    expect(prompt).toContain('<details>');
  });

  it('includes target MongoDB database in system context', () => {
    const prompt = buildCopilotSystemPrompt({
      tables: [],
      relationships: [],
      guardrailIssues: [],
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      targetDatabase: 'finops',
    });
    expect(prompt).toContain('Target MongoDB database');
    expect(prompt).toContain('finops');
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
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
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

  it('throws a clear error when Grove returns HTML instead of JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>Bad Gateway</body></html>',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callGroveChat({
        messages: [{ role: 'user', content: 'Hi' }],
        schemaContext: {
          tables: [],
          relationships: [],
          guardrailIssues: [],
          cardinalityOverrides: {},
          forceEmbedOverrides: {},
        },
      }),
    ).rejects.toThrow(/HTML instead of JSON/i);
  });

  it('throws a clear error when Grove fetch times out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callGroveChat({
        messages: [{ role: 'user', content: 'Hi' }],
        schemaContext: {
          tables: [],
          relationships: [],
          guardrailIssues: [],
          cardinalityOverrides: {},
          forceEmbedOverrides: {},
        },
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
