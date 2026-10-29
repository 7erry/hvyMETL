import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  detectBrowserLocale,
  readStoredLocale,
  writeStoredLocale,
  type LocaleId,
} from './locales';
import { translate, type MessageKey } from './messages';

type LocaleContextValue = {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): LocaleId {
  return readStoredLocale() ?? detectBrowserLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(initialLocale);

  const setLocale = (next: LocaleId) => {
    setLocaleState(next);
    writeStoredLocale(next);
  };

  useEffect(() => {
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale requires LocaleProvider');
  return value;
}

export function useT(): LocaleContextValue['t'] {
  return useLocale().t;
}
