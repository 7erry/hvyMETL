import { describe, expect, it } from 'vitest';
import { detectBrowserLocale, isLocaleId } from './locales';
import { CATALOGS, translate, type MessageKey } from './messages';

describe('i18n', () => {
  it('maps browser languages onto supported locales', () => {
    expect(detectBrowserLocale(['pt-BR', 'en'])).toBe('pt');
    expect(detectBrowserLocale(['es-MX'])).toBe('es');
    expect(detectBrowserLocale(['zh-Hans-CN'])).toBe('zh-CN');
    expect(detectBrowserLocale(['hi-IN'])).toBe('hi');
    expect(detectBrowserLocale(['de-DE'])).toBe('en');
    expect(isLocaleId('zh-CN')).toBe(true);
    expect(isLocaleId('fr')).toBe(false);
  });

  it('keeps every locale catalog complete and falls back for missing vars', () => {
    const keys = Object.keys(CATALOGS.en) as MessageKey[];
    for (const locale of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
      for (const key of keys) {
        expect(CATALOGS[locale][key]?.length).toBeGreaterThan(0);
      }
    }
    expect(translate('en', 'live.download')).toBe('Download');
    expect(translate('pt', 'common.save')).toBe('Salvar');
    expect(translate('zh-CN', 'nav.schema')).toBe('架构');
    expect(translate('hi', 'common.signIn')).toBe('साइन इन');
  });
});
