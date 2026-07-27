import { describe, expect, it } from 'vitest';
import {
  isAggregatePreviewTruncated,
  normalizeAggregateInspectPayload,
} from '../../src/copilot/mongoAggregateFormat.js';

describe('mongoAggregateFormat', () => {
  it('normalizes structured MCP aggregate payloads', () => {
    expect(
      normalizeAggregateInspectPayload({
        count: 2,
        documents: [{ _id: 1 }, { _id: 2 }],
        appliedLimits: [],
      }),
    ).toEqual({
      count: 2,
      documents: [{ _id: 1 }, { _id: 2 }],
      appliedLimits: [],
    });
  });

  it('normalizes a bare document array from text-block parsing', () => {
    expect(normalizeAggregateInspectPayload([{ _id: 'a' }])).toEqual({
      count: 1,
      documents: [{ _id: 'a' }],
      appliedLimits: [],
    });
  });

  it('detects count-only aggregate responses when previews are truncated', () => {
    const payload = normalizeAggregateInspectPayload({
      count: 148,
      documents: [],
      appliedLimits: ['tool.responseBytesLimit'],
    });
    expect(isAggregatePreviewTruncated(payload)).toBe(true);
  });
});
