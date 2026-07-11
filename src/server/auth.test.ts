import { afterEach, describe, expect, it } from 'vitest';
import {
  HVY_ROLES,
  effectiveRolesFromPayload,
  getPublicAuthConfig,
  issuerUrlToDomain,
  rolesFromPayload,
} from './auth.js';

describe('issuerUrlToDomain', () => {
  it('strips scheme and trailing slash from issuer URL', () => {
    expect(issuerUrlToDomain('https://tenant.us.auth0.com/')).toBe('tenant.us.auth0.com');
    expect(issuerUrlToDomain('https://tenant.us.auth0.com')).toBe('tenant.us.auth0.com');
  });
});

describe('getPublicAuthConfig', () => {
  const envKeys = [
    'HVYMETL_AUTH_DISABLED',
    'AUTH0_ISSUER_BASE_URL',
    'AUTH0_AUDIENCE',
    'AUTH0_SPA_CLIENT_ID',
    'AUTH0_CLIENT_ID',
    'AUTH0_ROLES_CLAIM',
  ] as const;

  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns authEnabled false when Auth0 env is unset', () => {
    for (const key of envKeys) delete process.env[key];
    expect(getPublicAuthConfig()).toEqual({
      authEnabled: false,
      rolesClaim: 'https://hvymetl.studio/roles',
      hostedUrl: 'https://hvymetl.studio',
    });
  });

  it('returns SPA settings when Auth0 is configured', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    process.env.AUTH0_SPA_CLIENT_ID = 'spa-client-id';
    expect(getPublicAuthConfig()).toEqual({
      authEnabled: true,
      domain: 'tenant.us.auth0.com',
      clientId: 'spa-client-id',
      audience: 'https://api.hvymetl.studio',
      rolesClaim: 'https://hvymetl.studio/roles',
      hostedUrl: 'https://hvymetl.studio',
    });
  });
});

describe('effectiveRolesFromPayload', () => {
  const envKeys = ['HVYMETL_AUTH_DISABLED', 'AUTH0_ISSUER_BASE_URL', 'AUTH0_AUDIENCE', 'HVYMETL_DEFAULT_ROLE'] as const;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults to developer when auth is on and the token has no roles', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    expect(effectiveRolesFromPayload({ sub: 'auth0|1' })).toEqual(['developer']);
  });

  it('honors explicit roles in the token over the default', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    expect(
      effectiveRolesFromPayload({
        sub: 'auth0|1',
        'https://hvymetl.studio/roles': ['admin'],
      }),
    ).toEqual(['admin']);
  });

  it('can disable the default with HVYMETL_DEFAULT_ROLE=none', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    process.env.HVYMETL_DEFAULT_ROLE = 'none';
    expect(effectiveRolesFromPayload({ sub: 'auth0|1' })).toEqual([]);
  });
});

describe('rolesFromPayload', () => {
  it('reads roles from the configured Auth0 roles claim', () => {
    const payload = {
      'https://hvymetl.studio/roles': ['developer', 'manager'],
    };
    expect(rolesFromPayload(payload)).toEqual(['developer', 'manager']);
  });

  it('falls back to roles and permissions claims', () => {
    const payload = {
      roles: ['admin'],
      permissions: ['developer'],
    };
    expect(rolesFromPayload(payload)).toEqual(['admin', 'developer']);
  });

  it('ignores unknown role strings', () => {
    const payload = {
      'https://hvymetl.studio/roles': ['developer', 'guest', 'manager'],
    };
    expect(rolesFromPayload(payload)).toEqual(['developer', 'manager']);
  });

  it('returns an empty list when no roles are present', () => {
    expect(rolesFromPayload(undefined)).toEqual([]);
    expect(rolesFromPayload({})).toEqual([]);
  });

  it('deduplicates repeated roles', () => {
    const payload = {
      'https://hvymetl.studio/roles': ['developer', 'developer'],
      roles: ['developer'],
    };
    expect(rolesFromPayload(payload)).toEqual(['developer']);
  });

  it('supports all hvyMETL roles', () => {
    expect(HVY_ROLES).toEqual(['admin', 'developer', 'manager']);
  });
});
