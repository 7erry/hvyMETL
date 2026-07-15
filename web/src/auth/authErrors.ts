export const SESSION_EXPIRED_MESSAGE = 'Session expired — please sign in again.';

export const SESSION_EXPIRED_DETAIL =
  'Your sign-in session ended or the browser lost its refresh token. Sign in again to continue.';

const SESSION_EXPIRED_PATTERNS = [
  /missing refresh token/i,
  /login_required/i,
  /invalid_grant/i,
  /consent_required/i,
];

/** Extract a message string from Auth0 or fetch errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; error?: unknown; error_description?: unknown };
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error_description === 'string') return record.error_description;
    if (typeof record.error === 'string') return record.error;
  }
  return '';
}

/** True when Auth0 cannot silently renew the access token (missing/expired refresh token). */
export function isSessionExpiredAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) return false;
  return SESSION_EXPIRED_PATTERNS.some((pattern) => pattern.test(message));
}

/** Map raw Auth0 errors to user-facing copy. */
export function formatAuthError(error: unknown): string {
  if (isSessionExpiredAuthError(error)) return SESSION_EXPIRED_MESSAGE;
  const message = errorMessage(error).trim();
  if (message) return message;
  return 'Authentication failed. Please sign in again.';
}

export class SessionExpiredError extends Error {
  constructor(message = SESSION_EXPIRED_MESSAGE) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/** Normalize token/API auth failures for UI and status messages. */
export function toAuthError(error: unknown): Error {
  if (error instanceof SessionExpiredError) return error;
  if (isSessionExpiredAuthError(error)) return new SessionExpiredError();
  if (error instanceof Error) return error;
  return new Error(formatAuthError(error));
}
