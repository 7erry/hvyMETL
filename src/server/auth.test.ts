import { afterEach, describe, expect, it } from 'vitest';
import {
  HVY_ROLES,
  SWAGGER_AUTH_COOKIE,
  authenticateSwaggerDocsAccess,
  effectiveRolesFromPayload,
  getPublicAuthConfig,
  issueSwaggerDocsCookie,
  issuerUrlToDomain,
  promoteQueryAccessToken,
  promoteSwaggerSessionCookie,
  rolesFromPayload,
} from './auth.js';
import type { Request, Response } from 'express';

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
  const envKeys = ['HVYMETL_AUTH_DISABLED', 'AUTH0_ISSUER_BASE_URL', 'AUTH0_AUDIENCE', 'HVYMETL_DEFAULT_ROLE', 'HVYMETL_ADMIN_SUBS'] as const;
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

  it('grants admin when sub is listed in HVYMETL_ADMIN_SUBS', () => {
    for (const key of [...envKeys, 'HVYMETL_ADMIN_SUBS']) delete process.env[key];
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    process.env.HVYMETL_ADMIN_SUBS = 'google-oauth2|104005738020757337481';
    expect(effectiveRolesFromPayload({ sub: 'google-oauth2|104005738020757337481' })).toEqual(['admin']);
  });
});

describe('promoteQueryAccessToken', () => {
  it('copies access_token query param to Authorization header and strips it from the URL', () => {
    const req = {
      headers: {} as Record<string, string>,
      url: '/api/docs?access_token=jwt-token&foo=1',
      originalUrl: '/api/docs?access_token=jwt-token&foo=1',
      query: { access_token: 'jwt-token', foo: '1' },
    } as Request;
    promoteQueryAccessToken(req, {} as Response, () => undefined);
    expect(req.headers.authorization).toBe('Bearer jwt-token');
    expect(req.url).toBe('/api/docs?foo=1');
    expect(req.originalUrl).toBe('/api/docs?foo=1');
  });

  it('does not override an existing Authorization header but still strips query token', () => {
    const req = {
      headers: { authorization: 'Bearer existing' },
      url: '/api/docs?access_token=jwt-token',
      originalUrl: '/api/docs?access_token=jwt-token',
      query: { access_token: 'jwt-token' },
    } as Request;
    promoteQueryAccessToken(req, {} as Response, () => undefined);
    expect(req.headers.authorization).toBe('Bearer existing');
    expect(req.url).toBe('/api/docs');
    expect(req.originalUrl).toBe('/api/docs');
  });

  it('reads access_token from req.query when Express has already parsed the URL', () => {
    const req = {
      headers: {} as Record<string, string>,
      url: '/api/docs',
      originalUrl: '/api/docs?access_token=jwt-token',
      query: { access_token: 'jwt-token' },
    } as Request;
    promoteQueryAccessToken(req, {} as Response, () => undefined);
    expect(req.headers.authorization).toBe('Bearer jwt-token');
  });
});

describe('promoteSwaggerSessionCookie', () => {
  it('promotes the bootstrap cookie to Authorization and clears it', () => {
    const req = {
      headers: { cookie: `${SWAGGER_AUTH_COOKIE}=jwt-token` },
    } as Request;
    const setCookie: string[] = [];
    const res = {
      append: (_name: string, value: string) => {
        setCookie.push(value);
      },
    } as unknown as Response;

    promoteSwaggerSessionCookie(req, res, () => undefined);
    expect(req.headers.authorization).toBe('Bearer jwt-token');
    expect(setCookie.some((value) => value.includes(`${SWAGGER_AUTH_COOKIE}=`) && value.includes('Max-Age=0'))).toBe(true);
  });
});

describe('issueSwaggerDocsCookie', () => {
  it('sets a short-lived HttpOnly cookie scoped to /api/docs', () => {
    const setCookie: string[] = [];
    const res = {
      append: (_name: string, value: string) => {
        setCookie.push(value);
      },
    } as unknown as Response;

    issueSwaggerDocsCookie(res, 'jwt-token');
    expect(setCookie[0]).toContain(`${SWAGGER_AUTH_COOKIE}=jwt-token`);
    expect(setCookie[0]).toContain('Path=/api/docs');
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('Max-Age=60');
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

describe('authenticateSwaggerDocsAccess', () => {
  const envKeys = ['HVYMETL_AUTH_DISABLED', 'AUTH0_ISSUER_BASE_URL', 'AUTH0_AUDIENCE', 'HVYMETL_HOSTED_URL'] as const;

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it('redirects unauthenticated browser requests to the studio openSwagger flow', () => {
    process.env.AUTH0_ISSUER_BASE_URL = 'https://tenant.us.auth0.com/';
    process.env.AUTH0_AUDIENCE = 'https://api.hvymetl.studio';
    process.env.HVYMETL_HOSTED_URL = 'https://hvymetl.studio';

    const req = {
      method: 'GET',
      path: '/api/docs/',
      protocol: 'https',
      headers: { accept: 'text/html,application/xhtml+xml' },
      get: (name: string) => (name.toLowerCase() === 'host' ? 'hvymetl.studio' : undefined),
      accepts: (types: string[]) => (types.includes('html') ? 'html' : false),
    } as unknown as Request;

    let redirectUrl = '';
    const res = {
      redirect: (_status: number, url: string) => {
        redirectUrl = url;
      },
    } as unknown as Response;

    authenticateSwaggerDocsAccess(req, res, () => undefined);
    expect(redirectUrl).toBe('https://hvymetl.studio/?openSwagger=%2Fapi%2Fdocs');
  });
});
