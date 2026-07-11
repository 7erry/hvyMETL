import { describe, expect, it } from 'vitest';
import { preferredUiRole, rolesFromClaims } from './access';

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
