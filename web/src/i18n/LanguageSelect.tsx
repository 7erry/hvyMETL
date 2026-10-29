import { LOCALES, LOCALE_LABELS } from './locales';
import { useLocale } from './LocaleContext';

type LanguageSelectProps = {
  className?: string;
  /** Compact select for the nav rail / auth card. */
  compact?: boolean;
};

export function LanguageSelect({ className = '', compact = false }: LanguageSelectProps) {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className={compact ? `language-select language-select--compact ${className}` : `language-select ${className}`}>
      <span className="language-select__label">{t('language.label')}</span>
      <select
        value={locale}
        aria-label={t('language.label')}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
      >
        {LOCALES.map((id) => (
          <option key={id} value={id}>
            {LOCALE_LABELS[id]}
          </option>
        ))}
      </select>
    </label>
  );
}
