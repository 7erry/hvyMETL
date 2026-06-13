import { describe, expect, it } from 'vitest';
import { HEARTBEAT_MAX_AGE_MS, isHeartbeatStale, resolveLocalIpAddress } from './phoneHome.js';

describe('phoneHome', () => {
  it('isHeartbeatStale is true when cache is missing or invalid', () => {
    expect(isHeartbeatStale(undefined)).toBe(true);
    expect(isHeartbeatStale('not-a-date')).toBe(true);
  });

  it('isHeartbeatStale is false within 23 hours', () => {
    const recent = new Date(Date.now() - HEARTBEAT_MAX_AGE_MS + 60_000).toISOString();
    expect(isHeartbeatStale(recent)).toBe(false);
  });

  it('isHeartbeatStale is true at or beyond 23 hours', () => {
    const stale = new Date(Date.now() - HEARTBEAT_MAX_AGE_MS).toISOString();
    expect(isHeartbeatStale(stale)).toBe(true);
  });

  it('resolveLocalIpAddress returns an IPv4 string', () => {
    const ip = resolveLocalIpAddress();
    expect(ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});
