import type { ReactNode } from 'react';
import { useAccess } from '../auth/HostedAuthProvider';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const access = useAccess();

  if (!access.enabled) return <>{children}</>;

  if (access.isLoading) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>Loading hvyMETL Studio…</strong>
          <p>Checking your sign-in session.</p>
        </section>
      </main>
    );
  }

  if (!access.isAuthenticated) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>Welcome to hvyMETL Studio</strong>
          <p>
            Sign in at <a href="https://hvymetl.studio">hvymetl.studio</a> with Google, Facebook, or your organization
            account to access migration design, manager review, and pipeline tools.
          </p>
          <button type="button" className="primary" onClick={() => void access.login()}>
            Sign in
          </button>
          <a href="/terms">Terms and Conditions</a>
          {access.error ? <p className="auth-gate__error">{access.error}</p> : null}
        </section>
      </main>
    );
  }

  if (!access.canUseDeveloper && !access.canUseManager) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>Access pending</strong>
          <p>Your account is signed in, but it does not have the admin, developer, or manager role yet.</p>
          <p>
            In Auth0: enable <strong>RBAC</strong> on the hvyMETL API, deploy the <strong>post-login</strong>{' '}
            Action, then sign out and sign in again. Clear site data if you changed the Action recently.
          </p>
          <p>
            Debug: DevTools → Network → <code>/api/auth/me</code> should return{' '}
            <code>{'"roles":["developer"]'}</code> or similar. Empty <code>roles</code> means the Login Action
            did not add <code>https://hvymetl.studio/roles</code> to your access token.
          </p>
          <a href="/terms">Terms and Conditions</a>
          <button type="button" className="secondary" onClick={access.logout}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
