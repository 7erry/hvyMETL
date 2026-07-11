export type HvyRole = 'admin' | 'developer' | 'manager';

export const HVY_ROLES: HvyRole[] = ['admin', 'developer', 'manager'];
export const DEFAULT_AUTH0_ROLES_CLAIM = 'https://hvymetl.studio/roles';

function isHvyRole(value: string): value is HvyRole {
  return HVY_ROLES.includes(value as HvyRole);
}

function valuesFromClaim(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

export function rolesFromClaims(
  claims: Record<string, unknown> | undefined,
  rolesClaim = DEFAULT_AUTH0_ROLES_CLAIM,
): HvyRole[] {
  if (!claims) return [];
  const rawRoles = [
    ...valuesFromClaim(claims[rolesClaim]),
    ...valuesFromClaim(claims.roles),
    ...valuesFromClaim(claims.permissions),
  ];
  return [...new Set(rawRoles.filter(isHvyRole))];
}

export function preferredUiRole(roles: HvyRole[]): 'developer' | 'manager' {
  if (roles.includes('developer') || roles.includes('admin')) return 'developer';
  return 'manager';
}

/** Decode a JWT payload segment (browser-safe; no signature verification). */
export function parseJwtPayload(token: string): Record<string, unknown> | undefined {
  const segments = token.split('.');
  if (segments.length < 2) return undefined;
  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
