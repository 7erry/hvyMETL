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

export type StudioRoleAccess = {
  isAdmin: boolean;
  canUseDeveloper: boolean;
  canUseManager: boolean;
  /** Admin-only toggle between Developer and Manager UI. */
  canSwitchUiRole: boolean;
  preferredRole: 'developer' | 'manager';
};

/**
 * Maps Auth0 roles to studio UI access.
 * Admin may use both modes. Everyone else gets exactly one mode — including users
 * who hold both developer and manager without admin (developer wins).
 */
export function resolveStudioRoleAccess(roles: HvyRole[]): StudioRoleAccess {
  const isAdmin = roles.includes('admin');
  if (isAdmin) {
    return {
      isAdmin: true,
      canUseDeveloper: true,
      canUseManager: true,
      canSwitchUiRole: true,
      preferredRole: preferredUiRole(roles),
    };
  }

  const hasDeveloper = roles.includes('developer');
  const hasManager = roles.includes('manager');

  if (hasDeveloper && hasManager) {
    return {
      isAdmin: false,
      canUseDeveloper: true,
      canUseManager: false,
      canSwitchUiRole: false,
      preferredRole: 'developer',
    };
  }

  if (hasDeveloper) {
    return {
      isAdmin: false,
      canUseDeveloper: true,
      canUseManager: false,
      canSwitchUiRole: false,
      preferredRole: 'developer',
    };
  }

  if (hasManager) {
    return {
      isAdmin: false,
      canUseDeveloper: false,
      canUseManager: true,
      canSwitchUiRole: false,
      preferredRole: 'manager',
    };
  }

  return {
    isAdmin: false,
    canUseDeveloper: false,
    canUseManager: false,
    canSwitchUiRole: false,
    preferredRole: 'developer',
  };
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
