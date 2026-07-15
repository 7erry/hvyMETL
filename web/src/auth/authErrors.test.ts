import { describe, expect, it } from 'vitest';
import {
  formatAuthError,
  isSessionExpiredAuthError,
  SESSION_EXPIRED_MESSAGE,
  SessionExpiredError,
  toAuthError,
} from './authErrors';

describe('authErrors', () => {
  it('detects missing refresh token errors', () => {
    const error = new Error(
      "Missing Refresh Token (audience: 'https://api.hvymetl.studio', scope: 'openid profile email offline_access')",
    );
    expect(isSessionExpiredAuthError(error)).toBe(true);
    expect(formatAuthError(error)).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('detects login_required style auth failures', () => {
    expect(isSessionExpiredAuthError({ error: 'login_required' })).toBe(true);
    expect(formatAuthError({ error: 'login_required' })).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('preserves unrelated error messages', () => {
    expect(formatAuthError(new Error('Network request failed'))).toBe('Network request failed');
    expect(isSessionExpiredAuthError(new Error('Network request failed'))).toBe(false);
  });

  it('wraps session expiry in SessionExpiredError', () => {
    const wrapped = toAuthError(new Error('Missing Refresh Token'));
    expect(wrapped).toBeInstanceOf(SessionExpiredError);
    expect(wrapped.message).toBe(SESSION_EXPIRED_MESSAGE);
  });
});
