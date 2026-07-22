import { describe, expect, it, vi } from 'vitest';
import * as auth from './auth.js';
import {
  DEFAULT_LOGICAL_TARGET_DB,
  LOCAL_DEV_TENANT_ID,
  parseLogicalTargetDb,
  resolvePhysicalTargetDb,
  resolveTargetDbForRequest,
  sanitizeExecutionTargetDbForClient,
  sanitizeTenantId,
  tenantDbPrefixFromPayload,
  tenantDbPrefixFromRequest,
  tenantDefaultTargetDb,
  tenantIdFromPayload,
  toLogicalTargetDb,
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

  it('returns the default logical import database name', () => {
    expect(tenantDefaultTargetDb('auth0|abc')).toBe(DEFAULT_LOGICAL_TARGET_DB);
  });

  it('derives a user prefix from Auth0 profile fields', () => {
    expect(tenantDbPrefixFromPayload({ name: 'Terry Walters' })).toBe('terry_walters');
    expect(tenantDbPrefixFromPayload({ email: 'terry.walters@example.com' })).toBe('terry_walters');
    expect(tenantDbPrefixFromPayload({ sub: 'auth0|abc' })).toMatch(/^u_[a-f0-9]{8}$/);
  });

  it('loads display name from Auth0 userinfo when the access token lacks profile claims', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');
    const req = {
      auth: { payload: { sub: 'google-oauth2|104005738020757337481' } },
      headers: { authorization: 'Bearer access-token' },
    } as Parameters<typeof tenantDbPrefixFromRequest>[0];
    await expect(tenantDbPrefixFromRequest(req)).resolves.toBe('terry_walters');
    vi.restoreAllMocks();
  });

  it('maps logical database names to physical Atlas names within shared-tier limits', () => {
    expect(resolvePhysicalTargetDb('terry_walters', 'csv_to_atlas')).toBe('terry_walters__csv_to_atlas');
    expect(resolvePhysicalTargetDb('terry_walters', 'csv_to_atlas').length).toBeLessThanOrEqual(38);
    const googleSub = 'google-oauth2|104005738020757337481';
    const prefix = tenantDbPrefixFromPayload({ sub: googleSub });
    const physical = resolvePhysicalTargetDb(prefix, 'csv_to_atlas');
    expect(physical.length).toBeLessThanOrEqual(38);
    expect(physical.endsWith('__csv_to_atlas')).toBe(true);
    const longLogical = 'x'.repeat(80);
    expect(resolvePhysicalTargetDb('terry_walters', longLogical).length).toBeLessThanOrEqual(38);
  });

  it('parses logical names and strips an accidental own prefix', () => {
    expect(parseLogicalTargetDb('csv_to_atlas', 'terry_walters')).toBe('csv_to_atlas');
    expect(parseLogicalTargetDb('terry_walters__csv_to_atlas', 'terry_walters')).toBe('csv_to_atlas');
    expect(() => parseLogicalTargetDb('other_user__secret', 'terry_walters')).toThrow(/invalid database/i);
  });

  it('resolves prefixed physical names when auth is enabled', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');
    const req = {
      auth: { payload: { sub: 'google-oauth2|104005738020757337481' } },
      headers: { authorization: 'Bearer access-token' },
    } as Parameters<typeof resolveTargetDbForRequest>[0];
    await expect(resolveTargetDbForRequest(req, 'csv_to_atlas')).resolves.toEqual({
      logical: 'csv_to_atlas',
      physical: 'terry_walters__csv_to_atlas',
    });
    vi.restoreAllMocks();
  });

  it('resolves target databases per request when auth is disabled', async () => {
    const req = { auth: undefined } as Parameters<typeof resolveTargetDbForRequest>[0];
    await expect(resolveTargetDbForRequest(req, 'my_app')).resolves.toEqual({
      logical: 'my_app',
      physical: 'my_app',
    });
  });

  it('strips tenant prefixes from execution records for the client', () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    const req = {
      auth: { payload: { name: 'Terry Walters' } },
    } as Parameters<typeof sanitizeExecutionTargetDbForClient>[1];
    const sanitized = sanitizeExecutionTargetDbForClient(
      { targetDb: 'terry_walters__csv_to_atlas', executionId: '1' },
      req,
    );
    expect(sanitized.targetDb).toBe('csv_to_atlas');
    expect(toLogicalTargetDb('terry_walters__csv_to_atlas')).toBe('csv_to_atlas');
    vi.restoreAllMocks();
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
