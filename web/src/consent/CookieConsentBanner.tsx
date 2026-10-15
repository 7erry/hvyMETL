import { useEffect, useState } from 'react';
import { useCookieConsent } from './CookieConsentContext';
import { defaultChoices, type ConsentChoices } from './consentStorage';

const CATEGORIES: { key: keyof ConsentChoices; title: string; detail: string; locked?: boolean }[] = [
  {
    key: 'necessary',
    title: 'Strictly necessary',
    detail: 'Keeps the studio session and this consent choice in local storage. Always on.',
    locked: true,
  },
  {
    key: 'functional',
    title: 'Functional',
    detail: 'Remembers studio preferences on this browser.',
  },
  {
    key: 'analytics',
    title: 'Analytics',
    detail: 'Platform telemetry about how the studio is used.',
  },
  {
    key: 'marketing',
    title: 'Marketing',
    detail: 'Measurement used to reach you about hvyMETL. Off when Global Privacy Control is on.',
  },
];

export function CookieConsentBanner() {
  const consent = useCookieConsent();
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

  const regimeCopy =
    consent.regime === 'opt-in'
      ? 'Your browser looks like a region that requires opt-in, so optional categories stay off until you accept.'
      : 'Your browser looks like a US region. You can opt out of analytics and marketing at any time.';

  return (
    <>
      {!consent.record && !consent.preferencesOpen ? (
        <aside className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title">
          <div>
            <h2 id="cookie-banner-title">Cookies and local storage</h2>
            <p>
              hvyMETL Studio stores strictly necessary preferences in this browser. Functional storage remembers studio
              settings. Analytics and marketing run only after you allow them. {regimeCopy}
              {consent.gpc ? ' Global Privacy Control is on, so analytics and marketing stay off.' : ''}
            </p>
          </div>
          <div className="cookie-banner__actions">
            <button type="button" className="tertiary" onClick={consent.openPreferences}>
              Manage preferences
            </button>
            <button type="button" className="secondary" onClick={consent.rejectAll}>
              Reject all
            </button>
            <button type="button" className="primary" onClick={consent.acceptAll}>
              Accept all
            </button>
          </div>
        </aside>
      ) : null}

      {consent.preferencesOpen ? (
        <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
          <div className="pipeline-modal panel cookie-preferences">
            <header className="pipeline-modal__header">
              <h2 id="cookie-preferences-title">Cookie preferences</h2>
              <button type="button" className="btn-icon" onClick={consent.closePreferences} aria-label="Close cookie preferences">
                ✕
              </button>
            </header>
            <p className="pipeline-hint">
              {regimeCopy}
              {consent.gpc ? ' Global Privacy Control is on, so analytics and marketing cannot be enabled.' : ''}
            </p>
            <div className="cookie-preferences__list">
              {CATEGORIES.map((category) => {
                const locked = category.locked === true || (consent.gpc && (category.key === 'analytics' || category.key === 'marketing'));
                return (
                  <label key={category.key} className="cookie-preferences__row">
                    <span>
                      <strong>{category.title}</strong>
                      <p>{category.detail}</p>
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
                Reject all
              </button>
              <button type="button" className="primary" onClick={() => consent.saveChoices(draft)}>
                Save preferences
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
