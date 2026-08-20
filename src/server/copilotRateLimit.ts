/**
 * In-memory rate limits for Copilot and sizing-assistant routes (Phase 0).
 */

import type { NextFunction, Request, Response } from 'express';

type Bucket = {
  count: number;
  windowStartMs: number;
};

const buckets = new Map<string, Bucket>();

export type CopilotRateLimitKind = 'chat' | 'inspect' | 'sizing-chat';

function readPositiveInt(envValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(envValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readCopilotRateLimitMax(kind: CopilotRateLimitKind): number {
  switch (kind) {
    case 'chat':
      return readPositiveInt(process.env.HVYMETL_COPILOT_CHAT_RATE_LIMIT, 30);
    case 'inspect':
      return readPositiveInt(process.env.HVYMETL_COPILOT_INSPECT_RATE_LIMIT, 120);
    case 'sizing-chat':
      return readPositiveInt(process.env.HVYMETL_SIZING_CHAT_RATE_LIMIT, 30);
  }
}

export function readCopilotRateLimitWindowMs(): number {
  return readPositiveInt(process.env.HVYMETL_COPILOT_RATE_LIMIT_WINDOW_MS, 60_000);
}

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function isRateLimitDisabled(): boolean {
  return process.env.HVYMETL_COPILOT_RATE_LIMIT_DISABLED === '1';
}

/** Reset buckets — test helper. */
export function resetCopilotRateLimitsForTests(): void {
  buckets.clear();
}

/** Test helper — consume a rate-limit token without HTTP. */
export function checkCopilotRateLimitForTests(
  kind: CopilotRateLimitKind,
  key: string,
): { allowed: boolean; retryAfterSec: number } {
  if (isRateLimitDisabled()) {
    return { allowed: true, retryAfterSec: 0 };
  }
  return takeToken(kind, key);
}

function takeToken(kind: CopilotRateLimitKind, key: string): { allowed: boolean; retryAfterSec: number } {
  const max = readCopilotRateLimitMax(kind);
  const windowMs = readCopilotRateLimitWindowMs();
  const bucketKey = `${kind}:${key}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);

  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(bucketKey, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - existing.windowStartMs)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Express middleware factory for copilot route rate limiting. */
export function createCopilotRateLimitMiddleware(kind: CopilotRateLimitKind) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isRateLimitDisabled()) {
      next();
      return;
    }

    const { allowed, retryAfterSec } = takeToken(kind, clientKey(req));
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Rate limit exceeded for ${kind}. Retry after ${retryAfterSec}s.`,
      });
      return;
    }

    next();
  };
}
