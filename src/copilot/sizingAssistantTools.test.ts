import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemorySizingSessionStore,
  createSizingSession,
  setSizingSessionStore,
} from './sizingAssistantSession.js';
import {
  executeSizingAssistantTool,
  extractParametersFromText,
  setSessionTranscripts,
} from './sizingAssistantTools.js';
import { stripPricingFields } from './sizingAssistantPresentation.js';

describe('sizingAssistantTools', () => {
  beforeEach(() => {
    setSizingSessionStore(new InMemorySizingSessionStore());
  });

  it('merges partial parameters and tracks shard penalty', () => {
    const session = createSizingSession();
    executeSizingAssistantTool(session.sessionId, 'update_sizing_parameters', {
      projected_total_data_size_gb: 500,
      total_raw_read_ops: 4000,
    });
    const penalty = executeSizingAssistantTool(session.sessionId, 'update_shard_penalty', {
      shard_penalty_multiplier: 2,
    });
    expect(penalty.data?.shard_penalty_multiplier).toBe(2);
  });

  it('prompt_for_missing_info lists required fields until complete', () => {
    const session = createSizingSession();
    const missing = executeSizingAssistantTool(session.sessionId, 'prompt_for_missing_info', {});
    expect(missing.data?.missingFields).toEqual([
      'projected_total_data_size_gb',
      'total_raw_read_ops',
      'total_raw_write_ops',
      'avg_doc_size_kb',
    ]);

    executeSizingAssistantTool(session.sessionId, 'update_sizing_parameters', {
      projected_total_data_size_gb: 400,
      total_raw_read_ops: 4000,
      total_raw_write_ops: 1500,
      avg_doc_size_kb: 2.5,
    });
    const complete = executeSizingAssistantTool(session.sessionId, 'prompt_for_missing_info', {});
    expect(complete.data?.missingFields).toEqual([]);
  });

  it('extracts sizing values from transcript text', () => {
    const extracted = extractParametersFromText(
      'We expect 800 GB data, 10,000 reads/sec, 2,500 writes/sec, 2.5 KB docs, bulk ops ok.',
    );
    expect(extracted.projected_total_data_size_gb).toBe(800);
    expect(extracted.total_raw_read_ops).toBe(10_000);
    expect(extracted.total_raw_write_ops).toBe(2500);
    expect(extracted.avg_doc_size_kb).toBe(2.5);
    expect(extracted.is_bulk_ops_permitted).toBe(true);
  });

  it('runs end-to-end tool flow through find_optimal_cluster_tier without pricing in public payload', () => {
    const session = createSizingSession();
    setSessionTranscripts(session.sessionId, [
      {
        id: 't1',
        title: 'Discovery call',
        body: '400 GB footprint, 4000 reads, 1500 writes, 2.5 KB average document.',
      },
    ]);

    executeSizingAssistantTool(session.sessionId, 'extract_sizing_from_transcripts', {});
    const tier = executeSizingAssistantTool(session.sessionId, 'find_optimal_cluster_tier', {});

    expect(tier.ok).toBe(true);
    const recommendations = tier.data?.recommendations as Array<Record<string, unknown>>;
    expect(Array.isArray(recommendations)).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].tierId).toBeTruthy();
    expect(tier.data?.oplogRecommendation).toMatchObject({
      estimatedOplogSizeGb: expect.any(Number),
      retentionHours: expect.any(Number),
    });
    expect(tier.data?.deploymentContext).toMatchObject({
      cloudProvider: 'AWS',
    });

    const sanitized = stripPricingFields(tier.data) as Record<string, unknown>;
    expect(JSON.stringify(sanitized)).not.toMatch(/finalHourlyCost/);
  });

  it('abort clears workflow state while keeping session usable', () => {
    const session = createSizingSession();
    executeSizingAssistantTool(session.sessionId, 'update_sizing_parameters', {
      projected_total_data_size_gb: 100,
    });
    executeSizingAssistantTool(session.sessionId, 'abort_sizing_process', {});
    const after = executeSizingAssistantTool(session.sessionId, 'prompt_for_missing_info', {});
    expect(after.data?.missingFields).toHaveLength(4);
  });
});
