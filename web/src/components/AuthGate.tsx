import type { ReactNode } from 'react';
import { SESSION_EXPIRED_DETAIL } from '../auth/authErrors';
import { useAccess } from '../auth/HostedAuthProvider';
import { PrivacyPreferencesLink } from '../consent/PrivacyPreferencesLink';
import { LanguageSelect } from '../i18n/LanguageSelect';
import { useT } from '../i18n/LocaleContext';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const access = useAccess();
  const t = useT();

  if (!access.enabled) return <>{children}</>;

  if (access.isLoading) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>{t('auth.loadingTitle')}</strong>
          <p>{t('auth.loadingBody')}</p>
          <LanguageSelect />
        </section>
      </main>
    );
  }

  if (access.sessionExpired) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>{t('auth.expiredTitle')}</strong>
          <p>{SESSION_EXPIRED_DETAIL}</p>
          <button type="button" className="primary" onClick={() => void access.reauthenticate()}>
            {t('common.signInAgain')}
          </button>
          <button type="button" className="secondary" onClick={access.logout}>
            {t('common.signOut')}
          </button>
          <a href="/terms">{t('auth.terms')}</a>
          <PrivacyPreferencesLink />
          <LanguageSelect />
        </section>
      </main>
    );
  }

  if (!access.isAuthenticated) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>{t('auth.welcomeTitle')}</strong>
          <p>
            {t('auth.welcomeBody')}{' '}
            <a href="https://hvymetl.studio">hvymetl.studio</a>
          </p>
          <button type="button" className="primary" onClick={() => void access.login()}>
            {t('common.signIn')}
          </button>
          <a href="/terms">{t('auth.terms')}</a>
          <PrivacyPreferencesLink />
          <LanguageSelect />
          {access.error ? <p className="auth-gate__error">{access.error}</p> : null}
        </section>
      </main>
    );
  }

  if (!access.canUseDeveloper && !access.canUseManager) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>{t('auth.pendingTitle')}</strong>
          <p>{t('auth.pendingBody')}</p>
          <p>
            In Auth0: enable <strong>RBAC</strong> on the hvyMETL API, deploy the <strong>post-login</strong>{' '}
            Action, then sign out and sign in again. Clear site data if you changed the Action recently.
          </p>
          <p>
            Debug: DevTools → Network → <code>/api/auth/me</code> should return{' '}
            <code>{'"roles":["developer"]'}</code> or similar. Empty <code>roles</code> means the Login Action
            did not add <code>https://hvymetl.studio/roles</code> to your access token.
          </p>
          <a href="/terms">{t('auth.terms')}</a>
          <PrivacyPreferencesLink />
          <LanguageSelect />
          <button type="button" className="secondary" onClick={access.logout}>
            {t('common.signOut')}
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
