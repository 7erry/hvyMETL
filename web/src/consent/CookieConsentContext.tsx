import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  applyGpc,
  choiceGranted,
  defaultChoices,
  detectConsentRegime,
  parseStoredConsent,
  readGlobalPrivacyControl,
  serializeConsent,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentRecord,
  type ConsentRegime,
} from './consentStorage';

type CookieConsentContextValue = {
  ready: boolean;
  regime: ConsentRegime;
  gpc: boolean;
  record: ConsentRecord | null;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  saveChoices: (choices: ConsentChoices) => void;
  granted: (category: ConsentCategory) => boolean;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

const DENIED: ConsentChoices = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

function readBrowserSignals(): { regime: ConsentRegime; gpc: boolean } {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return {
    gpc: readGlobalPrivacyControl(nav),
    regime: detectConsentRegime(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone),
  };
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [regime, setRegime] = useState<ConsentRegime>('opt-in');
  const [gpc, setGpc] = useState(false);
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const signals = readBrowserSignals();
    const stored = parseStoredConsent(localStorage.getItem(CONSENT_STORAGE_KEY));
    const next = stored ? { ...stored, ...applyGpc(stored, signals.gpc), gpc: stored.gpc || signals.gpc } : null;
    if (next && stored && (next.analytics !== stored.analytics || next.marketing !== stored.marketing)) {
      localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(next));
    }
    setRegime(signals.regime);
    setGpc(signals.gpc);
    setRecord(next);
    setReady(true);
  }, []);

  const persist = useCallback(
    (choices: ConsentChoices) => {
      const next: ConsentRecord = {
        ...applyGpc(choices, gpc),
        version: CONSENT_VERSION,
        decidedAt: new Date().toISOString(),
        regime,
        gpc,
      };
      localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(next));
      setRecord(next);
      setPreferencesOpen(false);
    },
    [gpc, regime],
  );

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      ready,
      regime,
      gpc,
      record,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptAll: () => persist(defaultChoices('opt-out', false)),
      rejectAll: () => persist(DENIED),
      saveChoices: persist,
      granted: (category) => {
        if (category === 'necessary') return true;
        if (!ready || !record) return false;
        return choiceGranted(applyGpc(record, gpc), category);
      },
    }),
    [gpc, persist, preferencesOpen, ready, record, regime],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): CookieConsentContextValue {
  const value = useContext(CookieConsentContext);
  if (!value) throw new Error('useCookieConsent must be used inside CookieConsentProvider');
  return value;
}

/** True only after a stored decision grants the category. Necessary is always allowed. */
export function useConsent(category: ConsentCategory): boolean {
  return useCookieConsent().granted(category);
}
