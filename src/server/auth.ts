import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import { hostedStudioUrl } from './hosted.js';

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

export const SWAGGER_AUTH_COOKIE = 'hvymetl_swagger_auth';
const SWAGGER_AUTH_COOKIE_PATH = '/api/docs';
const SWAGGER_AUTH_COOKIE_MAX_AGE_SEC = 60;

function readRequestQueryToken(req: Request): string | undefined {
  const fromQuery = req.query?.access_token;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  if (Array.isArray(fromQuery)) {
    const first = fromQuery.find((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
    if (first) return first.trim();
  }
  return undefined;
}

/** Remove access_token from the request URL so JWT middleware sees only one auth method. */
function stripAccessTokenFromRequestUrl(req: Request): string | undefined {
  const readToken = (url: string): { path: string; token?: string } => {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return { path: url };

    const pathname = url.slice(0, queryIndex);
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    const token = params.get('access_token')?.trim() || undefined;
    params.delete('access_token');
    const search = params.toString();
    return { path: search ? `${pathname}?${search}` : pathname, token };
  };

  const fromUrl = readToken(req.url);
  if (!fromUrl.token) return undefined;

  req.url = fromUrl.path;
  if (typeof req.originalUrl === 'string') {
    req.originalUrl = readToken(req.originalUrl).path;
  }
  return fromUrl.token;
}

function readCookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) !== name) continue;
    const raw = trimmed.slice(separator + 1);
    try {
      return decodeURIComponent(raw).trim() || undefined;
    } catch {
      return raw.trim() || undefined;
    }
  }
  return undefined;
}

function swaggerAuthCookieSecure(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(env('HVYMETL_HOSTED_URL') || env('HVYMETL_HOSTED') === '1');
}

function formatSwaggerAuthCookie(token: string): string {
  const secure = swaggerAuthCookieSecure();
  return [
    `${SWAGGER_AUTH_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${SWAGGER_AUTH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SWAGGER_AUTH_COOKIE_MAX_AGE_SEC}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function formatClearSwaggerAuthCookie(): string {
  const secure = swaggerAuthCookieSecure();
  return [
    `${SWAGGER_AUTH_COOKIE}=`,
    `Path=${SWAGGER_AUTH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/** Short-lived cookie set by POST /api/docs/bootstrap so Swagger can open in a new tab without ?access_token=. */
export function issueSwaggerDocsCookie(res: Response, bearerToken: string): void {
  const token = bearerToken.trim();
  if (!token) return;
  res.append('Set-Cookie', formatSwaggerAuthCookie(token));
}

function clearSwaggerDocsCookie(res: Response): void {
  res.append('Set-Cookie', formatClearSwaggerAuthCookie());
}

/** Allow Swagger UI new-tab links to pass a Bearer token via ?access_token= (legacy fallback). */
export const promoteQueryAccessToken: RequestHandler = (req, _res, next) => {
  const urlToken = stripAccessTokenFromRequestUrl(req);

  if (req.headers.authorization?.trim()) {
    next();
    return;
  }

  const queryToken = urlToken ?? readRequestQueryToken(req);
  if (queryToken) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }
  next();
};

/** Promote the bootstrap cookie into Authorization for browser new-tab Swagger visits. */
export const promoteSwaggerSessionCookie: RequestHandler = (req, res, next) => {
  if (req.headers.authorization?.trim()) {
    next();
    return;
  }

  const cookieToken = readCookieValue(req, SWAGGER_AUTH_COOKIE);
  if (cookieToken) {
    req.headers.authorization = `Bearer ${cookieToken}`;
    clearSwaggerDocsCookie(res);
  }
  next();
};

function swaggerDocsReturnPath(req: Request): string {
  const path = req.path.replace(/\/$/, '') || '/api/docs';
  return path.startsWith('/') ? path : '/api/docs';
}

function redirectToStudioSwaggerLogin(req: Request, res: Response): void {
  const configured = env('HVYMETL_HOSTED_URL');
  const base = (configured || hostedStudioUrl()).replace(/\/+$/, '');
  const docsPath = swaggerDocsReturnPath(req);
  res.redirect(302, `${base}/?openSwagger=${encodeURIComponent(docsPath)}`);
}

/**
 * Browser visits to /api/docs lack SPA Bearer tokens. Redirect HTML requests to the studio,
 * which opens Swagger in a new tab with ?access_token= after Auth0 login.
 */
export const authenticateSwaggerDocsAccess: RequestHandler = (req, res, next) => {
  if (!isAuthConfigured()) {
    next();
    return;
  }

  const prefersHtml =
    (req.method === 'GET' || req.method === 'HEAD') && req.accepts(['html', 'json']) === 'html';

  if (!req.headers.authorization?.trim()) {
    if (prefersHtml) {
      redirectToStudioSwaggerLogin(req, res);
      return;
    }
    requireAuth(req, res, next);
    return;
  }

  requireAuth(req, res, next);
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

export function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization?.trim();
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token || undefined;
}

/** Same display-name precedence as the web UI header (`HostedAuthProvider.userName`). */
export function readAuthDisplayName(payload: Record<string, unknown> | undefined): string {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (name) return name;
  const nickname = typeof payload?.nickname === 'string' ? payload.nickname.trim() : '';
  if (nickname) return nickname;
  const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
  if (email) return email;
  return '';
}

/** Load Auth0 profile claims when they are missing from the access token JWT. */
export async function fetchAuth0UserInfo(accessToken: string): Promise<Record<string, unknown> | null> {
  const issuer = env('AUTH0_ISSUER_BASE_URL').replace(/\/+$/, '');
  if (!issuer || !accessToken.trim()) return null;
  try {
    const response = await fetch(`${issuer}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Resolve the signed-in user's display name from JWT claims or Auth0 `/userinfo`. */
export async function resolveAuthDisplayName(
  payload: Record<string, unknown> | undefined,
  accessToken?: string,
): Promise<string> {
  const fromPayload = readAuthDisplayName(payload);
  if (fromPayload) return fromPayload;
  if (!accessToken?.trim()) return '';
  const userinfo = await fetchAuth0UserInfo(accessToken);
  return readAuthDisplayName(userinfo ?? undefined);
}

export function authErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error && typeof error === 'object' && 'status' in error) {
    const authError = error as { status?: number; message?: string };
    const status = Number(authError.status);
    if (status >= 400 && status < 600) {
      const message =
        typeof authError.message === 'string' && authError.message.trim()
          ? authError.message.trim()
          : status === 401
            ? 'Authentication required'
            : status === 403
              ? 'Forbidden'
              : `Request failed (${status})`;
      res.status(status).json({ error: message });
      return;
    }
  }
  next(error);
}
