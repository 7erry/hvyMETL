import { describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import {
  assertDatabaseAccess,
  augmentTenantMongoInspectScope,
  discoverPrefixCandidatesFromCluster,
  discoverTenantPhysicalDatabases,
  listLogicalDatabasesFromPhysical,
  mergeDiscoveredLogicalDatabases,
  resolveInspectScopeForCluster,
  resolveTenantMongoInspectScope,
  sanitizeDatabaseListForClient,
} from './mongoInspectScope.js';

describe('mongoInspectScope', () => {
  it('filters and strips tenant database prefixes for authenticated users', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const scope = await resolveTenantMongoInspectScope(req);
    const sanitized = sanitizeDatabaseListForClient(scope, [
      { name: 'terry_walters__csv_to_atlas', size: 100 },
      { name: 'other_user__csv_to_atlas', size: 50 },
      { name: 'sample_mflix', size: 10 },
    ]);

    expect(sanitized).toEqual([{ name: 'csv_to_atlas', size: 100 }]);
    expect(scope.resolvePhysicalDatabase('csv_to_atlas')).toBe('terry_walters__csv_to_atlas');
    expect(() => assertDatabaseAccess(scope, 'other_user__csv_to_atlas')).toThrow(/outside your workspace/i);
    vi.restoreAllMocks();
  });

  it('recognizes sub-hash and legacy import database names for the same tenant', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const scope = await resolveTenantMongoInspectScope(req);
    expect(scope.prefixCandidates).toContain('terry_walters');

    const hashPrefix = scope.prefixCandidates.find((prefix) => prefix.startsWith('u_'));
    expect(hashPrefix).toBeTruthy();

    const sanitized = sanitizeDatabaseListForClient(scope, [
      { name: `${hashPrefix}__csv_to_atlas`, size: 20 },
      { name: 'hvymetl_google-oauth2_abc', size: 10 },
    ]);
    expect(sanitized).toEqual([{ name: 'csv_to_atlas', size: 20 }]);

    const merged = mergeDiscoveredLogicalDatabases(scope, [`${hashPrefix}__csv_to_atlas`], []);
    expect(merged).toEqual([{ name: 'csv_to_atlas' }]);

    expect(scope.findPhysicalDatabaseForLogical('csv_to_atlas', [`${hashPrefix}__csv_to_atlas`])).toBe(
      `${hashPrefix}__csv_to_atlas`,
    );
    vi.restoreAllMocks();
  });

  it('uses logical database names when auth is disabled', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(false);
    const scope = await resolveTenantMongoInspectScope({ auth: undefined } as Parameters<
      typeof resolveTenantMongoInspectScope
    >[0]);
    expect(scope.resolvePhysicalDatabase('my_app')).toBe('my_app');
    expect(sanitizeDatabaseListForClient(scope, [{ name: 'my_app', size: 1 }])).toEqual([
      { name: 'my_app', size: 1 },
    ]);
    vi.restoreAllMocks();
  });

  it('discovers cluster prefixes that match the signed-in user identity slug', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc', email: 'terry.walters@example.com' } },
      headers: { authorization: 'Bearer token' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const scope = await resolveTenantMongoInspectScope(req, {
      clusterDatabaseNames: ['terry_walters__mytrains', 'other_user__app'],
    });

    expect(discoverPrefixCandidatesFromCluster(['terry_walters__mytrains'], ['terry_walters'])).toEqual([
      'terry_walters',
    ]);
    expect(scope.prefixCandidates).toContain('terry_walters');
    expect(
      sanitizeDatabaseListForClient(scope, [{ name: 'terry_walters__mytrains', size: 100 }]),
    ).toEqual([{ name: 'mytrains', size: 100 }]);

    const augmented = augmentTenantMongoInspectScope(
      scope,
      ['terry_walters__mytrains'],
      ['terry_walters'],
    );
    expect(augmented.resolvePhysicalDatabase('mytrains')).toBe('terry_walters__mytrains');
    vi.restoreAllMocks();
  });

  it('discovers prefixed databases via unique logical suffix when JWT prefix differs from Atlas', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const baseScope = await resolveTenantMongoInspectScope(req);
    expect(baseScope.prefixCandidates.some((prefix) => prefix.startsWith('u_'))).toBe(true);

    const clusterDatabaseNames = ['terry_walters__mytrains', 'terry_walters__railway_ops', 'other_user__app'];
    const resolved = resolveInspectScopeForCluster(baseScope, clusterDatabaseNames, ['mytrains', 'railway_ops']);
    const physical = discoverTenantPhysicalDatabases(resolved.scope, clusterDatabaseNames, ['mytrains', 'railway_ops']);
    const logical = listLogicalDatabasesFromPhysical(resolved.scope, physical);

    expect(resolved.scope.prefixCandidates).toContain('terry_walters');
    expect(logical.map((entry) => entry.name).sort()).toEqual(['mytrains', 'railway_ops']);
    vi.restoreAllMocks();
  });
});
