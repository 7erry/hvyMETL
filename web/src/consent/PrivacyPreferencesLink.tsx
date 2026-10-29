import { useT } from '../i18n/LocaleContext';
import { useCookieConsent } from './CookieConsentContext';

type PrivacyPreferencesLinkProps = {
  className?: string;
};

/** Reopens the cookie preference center so a saved choice can be changed. */
export function PrivacyPreferencesLink({ className = 'cookie-preferences-link' }: PrivacyPreferencesLinkProps) {
  const { openPreferences } = useCookieConsent();
  const t = useT();
  return (
    <button type="button" className={className} onClick={openPreferences}>
      {t('consent.prefsLink')}
    </button>
  );
}
