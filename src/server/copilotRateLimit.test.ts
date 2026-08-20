import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkCopilotRateLimitForTests,
  readCopilotRateLimitMax,
  resetCopilotRateLimitsForTests,
} from './copilotRateLimit.js';

describe('copilotRateLimit', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetCopilotRateLimitsForTests();
    process.env.HVYMETL_COPILOT_RATE_LIMIT_DISABLED = '0';
    process.env.HVYMETL_COPILOT_CHAT_RATE_LIMIT = '2';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetCopilotRateLimitsForTests();
  });

  it('reads configured chat limit from env', () => {
    expect(readCopilotRateLimitMax('chat')).toBe(2);
  });

  it('denies requests after the chat limit is exceeded', () => {
    const key = '127.0.0.1';
    expect(checkCopilotRateLimitForTests('chat', key).allowed).toBe(true);
    expect(checkCopilotRateLimitForTests('chat', key).allowed).toBe(true);
    const blocked = checkCopilotRateLimitForTests('chat', key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('allows unlimited requests when disabled via env', () => {
    process.env.HVYMETL_COPILOT_RATE_LIMIT_DISABLED = '1';
    const key = '127.0.0.1';
    for (let index = 0; index < 5; index += 1) {
      expect(checkCopilotRateLimitForTests('chat', key).allowed).toBe(true);
    }
  });
});
