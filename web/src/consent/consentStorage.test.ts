import { describe, expect, it } from 'vitest';
import {
  CONSENT_VERSION,
  applyGpc,
  defaultChoices,
  detectConsentRegime,
  parseStoredConsent,
  readGlobalPrivacyControl,
  serializeConsent,
  type ConsentRecord,
} from './consentStorage';

describe('cookie consent storage', () => {
  it('treats a US time zone as opt-out and Europe as opt-in', () => {
    expect(detectConsentRegime('en-US', 'America/New_York')).toBe('opt-out');
    expect(detectConsentRegime('de-DE', 'Europe/Berlin')).toBe('opt-in');
    expect(detectConsentRegime('en', 'Europe/London')).toBe('opt-in');
  });

  it('keeps analytics and marketing off when Global Privacy Control is set', () => {
    expect(readGlobalPrivacyControl({ globalPrivacyControl: true })).toBe(true);
    const choices = applyGpc(defaultChoices('opt-out', false), true);
    expect(choices.analytics).toBe(false);
    expect(choices.marketing).toBe(false);
    expect(choices.necessary).toBe(true);
  });

  it('drops a stored choice when the version does not match', () => {
    const record: ConsentRecord = {
      version: CONSENT_VERSION,
      decidedAt: '2026-10-15T00:00:00.000Z',
      regime: 'opt-in',
      gpc: false,
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    expect(parseStoredConsent(serializeConsent(record))?.decidedAt).toBe(record.decidedAt);
    expect(parseStoredConsent('{"version":0}')).toBeNull();
    expect(parseStoredConsent('{')).toBeNull();
  });
});
