import { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';
import { useCookieConsent } from './CookieConsentContext';
import { defaultChoices, type ConsentChoices } from './consentStorage';

const CATEGORY_KEYS: {
  key: keyof ConsentChoices;
  titleKey: MessageKey;
  detailKey: MessageKey;
  locked?: boolean;
}[] = [
  {
    key: 'necessary',
    titleKey: 'consent.necessaryTitle',
    detailKey: 'consent.necessaryDetail',
    locked: true,
  },
  {
    key: 'functional',
    titleKey: 'consent.functionalTitle',
    detailKey: 'consent.functionalDetail',
  },
  {
    key: 'analytics',
    titleKey: 'consent.analyticsTitle',
    detailKey: 'consent.analyticsDetail',
  },
  {
    key: 'marketing',
    titleKey: 'consent.marketingTitle',
    detailKey: 'consent.marketingDetail',
  },
];

export function CookieConsentBanner() {
  const consent = useCookieConsent();
  const t = useT();
  const [draft, setDraft] = useState<ConsentChoices>(defaultChoices('opt-in', false));

  useEffect(() => {
    if (!consent.preferencesOpen) return;
    setDraft(consent.record ?? defaultChoices(consent.regime, consent.gpc));
  }, [consent.gpc, consent.preferencesOpen, consent.record, consent.regime]);

  useEffect(() => {
    if (!consent.preferencesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') consent.closePreferences();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [consent]);

  if (!consent.ready) return null;

  const regimeCopy = consent.regime === 'opt-in' ? t('consent.regimeOptIn') : t('consent.regimeOptOut');

  return (
    <>
      {!consent.record && !consent.preferencesOpen ? (
        <aside className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title">
          <div>
            <h2 id="cookie-banner-title">{t('consent.bannerTitle')}</h2>
            <p>
              {t('consent.bannerBody')} {regimeCopy}
            </p>
          </div>
          <div className="cookie-banner__actions">
            <button type="button" className="tertiary" onClick={consent.openPreferences}>
              {t('consent.customize')}
            </button>
            <button type="button" className="secondary" onClick={consent.rejectAll}>
              {t('consent.rejectOptional')}
            </button>
            <button type="button" className="primary" onClick={consent.acceptAll}>
              {t('consent.acceptAll')}
            </button>
          </div>
        </aside>
      ) : null}

      {consent.preferencesOpen ? (
        <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
          <div className="pipeline-modal panel cookie-preferences">
            <header className="pipeline-modal__header">
              <h2 id="cookie-preferences-title">{t('consent.prefsTitle')}</h2>
              <button
                type="button"
                className="btn-icon"
                onClick={consent.closePreferences}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </header>
            <p className="pipeline-hint">{regimeCopy}</p>
            <div className="cookie-preferences__list">
              {CATEGORY_KEYS.map((category) => {
                const locked =
                  category.locked === true ||
                  (consent.gpc && (category.key === 'analytics' || category.key === 'marketing'));
                return (
                  <label key={category.key} className="cookie-preferences__row">
                    <span>
                      <strong>{t(category.titleKey)}</strong>
                      <p>{t(category.detailKey)}</p>
                    </span>
                    <input
                      type="checkbox"
                      checked={category.key === 'necessary' ? true : draft[category.key]}
                      disabled={locked}
                      onChange={(event) => {
                        const key = category.key;
                        if (key === 'necessary') return;
                        setDraft((prev) => ({ ...prev, [key]: event.target.checked }));
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <div className="cookie-banner__actions">
              <button type="button" className="secondary" onClick={consent.rejectAll}>
                {t('consent.rejectOptional')}
              </button>
              <button type="button" className="primary" onClick={() => consent.saveChoices(draft)}>
                {t('consent.savePrefs')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
