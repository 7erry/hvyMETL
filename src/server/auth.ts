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
      const roles = rolesFromPayload(req.auth?.payload);
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
