export const LOCALES = ['en', 'pt', 'es', 'zh-CN', 'hi'] as const;

export type LocaleId = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  'zh-CN': '简体中文',
  hi: 'हिन्दी',
};

export const LOCALE_STORAGE_KEY = 'hvymetl.locale';

export function isLocaleId(value: string): value is LocaleId {
  return (LOCALES as readonly string[]).includes(value);
}

/** Browser language → closest supported locale. */
export function detectBrowserLocale(languages: readonly string[] = navigator.languages ?? [navigator.language]): LocaleId {
  for (const raw of languages) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('pt')) return 'pt';
    if (tag.startsWith('es')) return 'es';
    if (tag.startsWith('zh')) return 'zh-CN';
    if (tag.startsWith('hi')) return 'hi';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

export function readStoredLocale(): LocaleId | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return value && isLocaleId(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: LocaleId): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
}
