import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  checkCopilotRateLimitForTests,
  copilotRateLimitClientKey,
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

  it('keys the limit on the Auth0 sub and ignores X-Forwarded-For', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9' },
      socket: { remoteAddress: '10.0.0.1' },
      auth: { payload: { sub: 'auth0|abc' } },
    } as Request & { auth?: { payload?: { sub?: string } } };
    expect(copilotRateLimitClientKey(req)).toBe('sub:auth0|abc');
    const withoutSub = { ...req, auth: undefined };
    expect(copilotRateLimitClientKey(withoutSub)).toBe('ip:9.9.9.9');
  });

  it('allows unlimited requests when disabled via env', () => {
    process.env.HVYMETL_COPILOT_RATE_LIMIT_DISABLED = '1';
    const key = '127.0.0.1';
    for (let index = 0; index < 5; index += 1) {
      expect(checkCopilotRateLimitForTests('chat', key).allowed).toBe(true);
    }
  });
});
