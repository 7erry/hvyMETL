import { describe, expect, it } from 'vitest';
import { liveExtractPollDecision } from './api';

describe('liveExtractPollDecision', () => {
  it('keeps a live stream going and stops a failed or idle extract', () => {
    expect(liveExtractPollDecision('running', 10, 120_000)).toBe('wait');
    expect(liveExtractPollDecision('complete', 10, 0)).toBe('ready');
    expect(liveExtractPollDecision('error', 0, 0)).toBe('error');
    expect(liveExtractPollDecision('running', 0, 89_000)).toBe('wait');
    expect(liveExtractPollDecision('running', 0, 90_000)).toBe('stalled');
    expect(liveExtractPollDecision('pending', 0, 90_000)).toBe('stalled');
  });
});
