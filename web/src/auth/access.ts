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
