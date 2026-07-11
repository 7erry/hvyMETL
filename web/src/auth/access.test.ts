import { describe, expect, it } from 'vitest';
import { parseJwtPayload, preferredUiRole, rolesFromClaims } from './access';

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
