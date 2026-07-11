import { describe, expect, it } from 'vitest';
import {
  LOCAL_DEV_TENANT_ID,
  sanitizeTenantId,
  tenantDefaultTargetDb,
  tenantIdFromPayload,
  assertPathWithinRoot,
  assertPathWithinTenantStorage,
} from './tenant.js';

describe('tenant helpers', () => {
  it('sanitizes Auth0 sub claims for filesystem use', () => {
    expect(sanitizeTenantId('google-oauth2|123456789')).toBe('google-oauth2_123456789');
    expect(tenantIdFromPayload({ sub: 'auth0|abc' })).toBe('auth0_abc');
  });

  it('uses local-dev tenant when auth payload is missing', () => {
    expect(tenantIdFromPayload(undefined)).toBeNull();
    expect(sanitizeTenantId('')).toBe(LOCAL_DEV_TENANT_ID);
  });

  it('builds a bounded default import database name', () => {
    const longId = 'x'.repeat(80);
    expect(tenantDefaultTargetDb(longId).length).toBeLessThanOrEqual(63);
  });

  it('rejects paths outside tenant storage roots', () => {
    const root = '/tmp/hvymetl/web-uploads/tenants/user_a';
    expect(() => assertPathWithinRoot(root, '/etc/passwd')).toThrow(/outside your workspace/i);
    expect(() => assertPathWithinRoot(root, joinSafe(root, 'csv/file.csv'))).not.toThrow();
  });

  it('allows paths under tenant upload or output trees', () => {
    const rootDir = '/tmp/hvymetl';
    const tenantId = 'user_a';
    expect(() =>
      assertPathWithinTenantStorage(rootDir, tenantId, '/tmp/hvymetl/out/tenants/user_a/ui-pipeline/plan.json'),
    ).not.toThrow();
    expect(() =>
      assertPathWithinTenantStorage(rootDir, tenantId, '/tmp/hvymetl/web-uploads/tenants/user_a/csv/a.csv'),
    ).not.toThrow();
    expect(() => assertPathWithinTenantStorage(rootDir, tenantId, '/tmp/hvymetl/out/ui-pipeline/plan.json')).toThrow();
  });
});

function joinSafe(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}
