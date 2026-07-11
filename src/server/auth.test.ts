import { describe, expect, it } from 'vitest';
import { HVY_ROLES, rolesFromPayload } from './auth.js';

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
