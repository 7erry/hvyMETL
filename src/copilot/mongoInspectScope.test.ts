import { describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import {
  assertDatabaseAccess,
  augmentTenantMongoInspectScope,
  discoverPrefixCandidatesFromCluster,
  discoverTenantPhysicalDatabases,
  mergeDiscoveredLogicalDatabases,
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
    expect(scope.primaryPrefix.startsWith('u_')).toBe(true);
    expect(scope.resolvePhysicalDatabase('csv_to_atlas')).toBe(`${scope.primaryPrefix}__csv_to_atlas`);
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
    expect(augmented.resolvePhysicalDatabase('mytrains')).toBe(`${augmented.primaryPrefix}__mytrains`);
    vi.restoreAllMocks();
  });

  it('does not grant terry_walters databases from the client prefix header', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token', 'x-hvymetl-db-prefix': 'terry_walters' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const baseScope = await resolveTenantMongoInspectScope(req);
    expect(baseScope.prefixCandidates.some((prefix) => prefix.startsWith('u_'))).toBe(true);
    expect(baseScope.prefixCandidates).not.toContain('terry_walters');
    expect(baseScope.ownsPhysicalDatabase('terry_walters__mytrains')).toBe(false);
    vi.restoreAllMocks();
  });

  it('does not treat another tenant database as owned when pipeline history matches the logical name', async () => {
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(true);
    vi.spyOn(auth, 'resolveAuthDisplayName').mockResolvedValue('Terry Walters');

    const req = {
      auth: { payload: { sub: 'google-oauth2|abc' } },
      headers: { authorization: 'Bearer token' },
    } as Parameters<typeof resolveTenantMongoInspectScope>[0];

    const scope = await resolveTenantMongoInspectScope(req);
    const clusterDatabaseNames = ['other_user__csv_to_atlas'];
    const physical = discoverTenantPhysicalDatabases(scope, clusterDatabaseNames, ['csv_to_atlas']);

    expect(physical).toEqual([]);
    expect(() => assertDatabaseAccess(scope, 'other_user__csv_to_atlas')).toThrow(/outside your workspace/i);
    vi.restoreAllMocks();
  });
});
