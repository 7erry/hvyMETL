import { describe, expect, it } from 'vitest';
import { parseJwtPayload, preferredUiRole, resolveStudioRoleAccess, rolesFromClaims } from './access';

describe('parseJwtPayload', () => {
  it('decodes a JWT payload segment', () => {
    const payload = { 'https://hvymetl.studio/roles': ['developer'], sub: 'auth0|1' };
    const token = `hdr.${btoa(JSON.stringify(payload))}.sig`;
    expect(parseJwtPayload(token)).toEqual(payload);
  });
});

describe('rolesFromClaims', () => {
  it('parses Auth0 role claims from the hosted app namespace', () => {
    const claims = {
      'https://hvymetl.studio/roles': ['manager'],
    };
    expect(rolesFromClaims(claims)).toEqual(['manager']);
  });

  it('prefers developer UI for admin and developer roles', () => {
    expect(preferredUiRole(['admin'])).toBe('developer');
    expect(preferredUiRole(['developer'])).toBe('developer');
    expect(preferredUiRole(['manager'])).toBe('manager');
  });
});

describe('resolveStudioRoleAccess', () => {
  it('grants both modes and switching only to admin', () => {
    expect(resolveStudioRoleAccess(['admin'])).toMatchObject({
      canUseDeveloper: true,
      canUseManager: true,
      canSwitchUiRole: true,
    });
  });

  it('grants a single mode for developer or manager alone', () => {
    expect(resolveStudioRoleAccess(['developer'])).toEqual({
      isAdmin: false,
      canUseDeveloper: true,
      canUseManager: false,
      canSwitchUiRole: false,
      preferredRole: 'developer',
    });
    expect(resolveStudioRoleAccess(['manager'])).toEqual({
      isAdmin: false,
      canUseDeveloper: false,
      canUseManager: true,
      canSwitchUiRole: false,
      preferredRole: 'manager',
    });
  });

  it('does not grant manager UI when user has developer and manager without admin', () => {
    expect(resolveStudioRoleAccess(['developer', 'manager'])).toEqual({
      isAdmin: false,
      canUseDeveloper: true,
      canUseManager: false,
      canSwitchUiRole: false,
      preferredRole: 'developer',
    });
  });
});
