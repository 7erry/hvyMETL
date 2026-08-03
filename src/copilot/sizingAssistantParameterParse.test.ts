import { beforeEach, describe, expect, it } from 'vitest';
import { parseSizingParameterUpdate } from './sizingAssistantParameterParse.js';
import { extractParametersFromText, executeSizingAssistantTool } from './sizingAssistantTools.js';
import {
  appendChatMessages,
  createSizingSession,
  InMemorySizingSessionStore,
  setSizingSessionStore,
} from './sizingAssistantSession.js';

describe('sizingAssistantParameterParse', () => {
  it('maps LLM aliases and coerces string numbers', () => {
    const patch = parseSizingParameterUpdate({
      cluster_data_size_gb: '5,000',
      peak_read_qps: '400',
      peak_write_tps: 400,
      average_document_size_kb: '2.5',
    });
    expect(patch).toEqual({
      projected_total_data_size_gb: 5000,
      total_raw_read_ops: 400,
      total_raw_write_ops: 400,
      avg_doc_size_kb: 2.5,
    });
  });

  it('unwraps nested parameters object', () => {
    const patch = parseSizingParameterUpdate({
      parameters: {
        projected_total_data_size_gb: 120,
        total_raw_read_ops: 50,
        total_raw_write_ops: 10,
        avg_doc_size_kb: 1,
      },
    });
    expect(patch.projected_total_data_size_gb).toBe(120);
    expect(patch.avg_doc_size_kb).toBe(1);
  });
});

describe('extractParametersFromText user phrasing', () => {
  it('parses comma-separated GB and qts typo', () => {
    const patch = extractParametersFromText(
      'cluster data size is 5,000 GB, peak reads is 400 qts, peak writes are 400 tps, average document size is 2.5 KB',
    );
    expect(patch.projected_total_data_size_gb).toBe(5000);
    expect(patch.total_raw_read_ops).toBe(400);
    expect(patch.total_raw_write_ops).toBe(400);
    expect(patch.avg_doc_size_kb).toBe(2.5);
  });
});

describe('update_sizing_parameters with chat supplement', () => {
  beforeEach(() => {
    setSizingSessionStore(new InMemorySizingSessionStore());
  });

  it('recovers required fields from chat when tool args use wrong keys', () => {
    const session = createSizingSession();
    appendChatMessages(session, [
      {
        role: 'user',
        content:
          'cluster data size is 5,000 GB, peak reads is 400 qts, peak writes are 400 tps, average document size is 2.5 KB',
      },
    ]);

    executeSizingAssistantTool(session.sessionId, 'update_sizing_parameters', {
      cluster_data_size_gb: 5000,
      peak_read_qps: 400,
      peak_write_tps: 400,
      average_document_size_kb: 2.5,
    });

    const tier = executeSizingAssistantTool(session.sessionId, 'find_optimal_cluster_tier', {});
    expect(tier.ok).toBe(true);
  });
});
