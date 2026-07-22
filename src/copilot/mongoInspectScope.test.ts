import { describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import {
  assertDatabaseAccess,
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
});
