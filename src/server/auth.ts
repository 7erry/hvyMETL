import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';

export type HvyRole = 'admin' | 'developer' | 'manager';

export const HVY_ROLES: HvyRole[] = ['admin', 'developer', 'manager'];
export const DEFAULT_AUTH0_ROLES_CLAIM = 'https://hvymetl.studio/roles';

type RequestWithAuth = Request & {
  auth?: {
    payload?: Record<string, unknown>;
  };
};

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function isAuthConfigured(): boolean {
  if (env('HVYMETL_AUTH_DISABLED') === '1') return false;
  return Boolean(env('AUTH0_ISSUER_BASE_URL') && env('AUTH0_AUDIENCE'));
}

export type PublicAuthConfig = {
  authEnabled: boolean;
  domain?: string;
  clientId?: string;
  audience?: string;
  rolesClaim: string;
  hostedUrl: string;
};

/** Auth0 tenant domain from issuer URL, e.g. `https://tenant.us.auth0.com/` → `tenant.us.auth0.com`. */
export function issuerUrlToDomain(issuerBaseUrl: string): string {
  return issuerBaseUrl.replace(/^https:\/\//i, '').replace(/\/+$/, '');
}

/** Public Auth0 SPA settings for the web UI (client ID is not secret for SPAs). */
export function getPublicAuthConfig(hostedUrl = 'https://hvymetl.studio'): PublicAuthConfig {
  const rolesClaim = env('AUTH0_ROLES_CLAIM') || DEFAULT_AUTH0_ROLES_CLAIM;
  if (!isAuthConfigured()) {
    return { authEnabled: false, rolesClaim, hostedUrl };
  }
  const issuer = env('AUTH0_ISSUER_BASE_URL');
  const clientId = env('AUTH0_SPA_CLIENT_ID') || env('AUTH0_CLIENT_ID');
  return {
    authEnabled: true,
    domain: issuer ? issuerUrlToDomain(issuer) : undefined,
    clientId: clientId || undefined,
    audience: env('AUTH0_AUDIENCE') || undefined,
    rolesClaim,
    hostedUrl,
  };
}

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

function isHvyRole(value: string): value is HvyRole {
  return HVY_ROLES.includes(value as HvyRole);
}

export function rolesFromPayload(
  payload: Record<string, unknown> | undefined,
  rolesClaim = env('AUTH0_ROLES_CLAIM') || DEFAULT_AUTH0_ROLES_CLAIM,
): HvyRole[] {
  if (!payload) return [];
  const roles = [
    ...stringValues(payload[rolesClaim]),
    ...stringValues(payload.roles),
    ...stringValues(payload.permissions),
  ];
  return [...new Set(roles.filter(isHvyRole))];
}

function adminSubsFromEnv(): Set<string> {
  const raw = env('HVYMETL_ADMIN_SUBS');
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export type RolesResolutionSource = 'token' | 'admin_allowlist' | 'default' | 'none';

export function resolveEffectiveRoles(
  payload: Record<string, unknown> | undefined,
  rolesClaim = env('AUTH0_ROLES_CLAIM') || DEFAULT_AUTH0_ROLES_CLAIM,
): { roles: HvyRole[]; source: RolesResolutionSource } {
  const tokenRoles = rolesFromPayload(payload, rolesClaim);
  if (tokenRoles.length > 0) {
    return { roles: tokenRoles, source: 'token' };
  }
  if (!isAuthConfigured()) {
    return { roles: [], source: 'none' };
  }

  const sub = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
  if (sub && adminSubsFromEnv().has(sub)) {
    return { roles: ['admin'], source: 'admin_allowlist' };
  }

  const configuredDefault = env('HVYMETL_DEFAULT_ROLE');
  if (configuredDefault.toLowerCase() === 'none') {
    return { roles: [], source: 'none' };
  }

  const fallback = configuredDefault || 'developer';
  if (isHvyRole(fallback)) {
    return { roles: [fallback], source: 'default' };
  }
  return { roles: [], source: 'none' };
}

/**
 * Roles from the JWT, with a hosted-studio fallback when Auth0 login succeeds but no role claim
 * is present (e.g. post-login Action not wired yet). Set HVYMETL_DEFAULT_ROLE=none to disable.
 * Set HVYMETL_ADMIN_SUBS to comma-separated Auth0 user IDs (JWT sub) for bootstrap admins.
 */
export function effectiveRolesFromPayload(
  payload: Record<string, unknown> | undefined,
  rolesClaim = env('AUTH0_ROLES_CLAIM') || DEFAULT_AUTH0_ROLES_CLAIM,
): HvyRole[] {
  return resolveEffectiveRoles(payload, rolesClaim).roles;
}

let cachedAuthMiddleware: RequestHandler | undefined;

function getAuthMiddleware(): RequestHandler {
  if (!cachedAuthMiddleware) {
    cachedAuthMiddleware = auth({
      issuerBaseURL: env('AUTH0_ISSUER_BASE_URL'),
      audience: env('AUTH0_AUDIENCE'),
      tokenSigningAlg: 'RS256',
    });
  }
  return cachedAuthMiddleware;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isAuthConfigured()) return next();
  return getAuthMiddleware()(req, res, next);
};

export function requireRole(allowedRoles: HvyRole[]): RequestHandler[] {
  return [
    requireAuth,
    (req: RequestWithAuth, res: Response, next: NextFunction) => {
      if (!isAuthConfigured()) return next();
      const roles = effectiveRolesFromPayload(req.auth?.payload);
      if (allowedRoles.some((role) => roles.includes(role))) return next();
      res.status(403).json({
        error: `Forbidden: requires one of ${allowedRoles.join(', ')}`,
      });
    },
  ];
}

export function authErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: number }).status);
    if (status === 401) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
  }
  next(error);
}
