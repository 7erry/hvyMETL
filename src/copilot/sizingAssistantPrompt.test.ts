import { describe, expect, it } from 'vitest';
import {
  buildSizingAssistantSystemPrompt,
  SIZING_ASSISTANT_INSTRUCTIONS,
  SIZING_ASSISTANT_SYSTEM_PROMPT,
} from './sizingAssistantPrompt.js';
import { SIZING_ASSISTANT_LOGIC_REFERENCE } from './sizingAssistantLogicReference.js';

describe('sizingAssistantPrompt', () => {
  it('defines sizing assistant role and required tools', () => {
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('MongoDB Atlas cluster sizing assistant');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('update_sizing_parameters');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('update_shard_penalty');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('abort_sizing_process');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('handoff_to_resource_curator');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('get_session_transcripts');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('extract_sizing_from_transcripts');
  });

  it('requires thought process before tool calls and presentation rules for calculation output', () => {
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('"thought" process');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('find_optimal_cluster_tier');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('prompt_for_missing_info');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('should NOT mention the cost breakdown');
  });

  it('documents multi-cloud support and cluster-level aggregation', () => {
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('AWS**, **GCP**, and **Azure**');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('Oplog Recommendations');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('is_multi_region_required_for_ha=True');
    expect(SIZING_ASSISTANT_INSTRUCTIONS).toContain('cluster level');
  });

  it('includes infrastructure architect framework in composed system prompt', () => {
    const prompt = buildSizingAssistantSystemPrompt();
    expect(prompt).toContain('Infrastructure Architect Framework');
    expect(prompt).toContain('Principal MongoDB Atlas Infrastructure Architect');
    expect(prompt).toContain('Working Set & RAM Sizing');
    expect(prompt).toContain('Sizing & Capacity Breakdown Table');
    expect(prompt).toContain('Peak Read Operations/sec (QPS)');
  });

  it('includes full sizing engine logic reference in composed system prompt', () => {
    const prompt = buildSizingAssistantSystemPrompt();
    expect(prompt).toContain('Sizing Logic Reference');
    expect(prompt).toContain('shard_penalty_multiplier');
    expect(prompt).toContain(SIZING_ASSISTANT_LOGIC_REFERENCE);
    expect(SIZING_ASSISTANT_SYSTEM_PROMPT).toBe(prompt);
  });

  it('logic reference covers normalization, filters, and ranking', () => {
    expect(SIZING_ASSISTANT_LOGIC_REFERENCE).toContain('normalized_read_ops');
    expect(SIZING_ASSISTANT_LOGIC_REFERENCE).toContain('Section 10: Summary of Decision Flow');
    expect(SIZING_ASSISTANT_LOGIC_REFERENCE).toContain('1.75 ^ 2');
  });
});
