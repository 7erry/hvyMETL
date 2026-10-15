export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = 'hvymetl.cookie-consent';

export type ConsentCategory = 'necessary' | 'functional' | 'analytics' | 'marketing';
export type ConsentRegime = 'opt-in' | 'opt-out';

export type ConsentChoices = {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentRecord = ConsentChoices & {
  version: number;
  decidedAt: string;
  regime: ConsentRegime;
  gpc: boolean;
};

type NavigatorPrivacy = {
  globalPrivacyControl?: boolean;
};

/** US zones only. shortcut: time zone is not geolocation, upgrade when a consented geo lookup exists. */
const US_TIME_ZONE =
  /^(America\/(New_York|Detroit|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu)$/;

export function readGlobalPrivacyControl(nav: NavigatorPrivacy | undefined): boolean {
  return nav?.globalPrivacyControl === true;
}

/** EU/UK and unknown regions require prior opt-in. A US language or time zone uses opt-out. */
export function detectConsentRegime(language: string, timeZone: string): ConsentRegime {
  if (language.toLowerCase().endsWith('-us') || US_TIME_ZONE.test(timeZone)) return 'opt-out';
  return 'opt-in';
}

export function defaultChoices(regime: ConsentRegime, gpc: boolean): ConsentChoices {
  const optional = regime === 'opt-out' && !gpc;
  return {
    necessary: true,
    functional: optional,
    analytics: optional,
    marketing: optional,
  };
}

/** GPC is an opt-out of analytics and marketing. Necessary stays on. */
export function applyGpc(choices: ConsentChoices, gpc: boolean): ConsentChoices {
  if (!gpc) return { ...choices, necessary: true };
  return { ...choices, necessary: true, analytics: false, marketing: false };
}

export function choiceGranted(choices: ConsentChoices, category: ConsentCategory): boolean {
  switch (category) {
    case 'necessary':
      return true;
    case 'functional':
      return choices.functional;
    case 'analytics':
      return choices.analytics;
    case 'marketing':
      return choices.marketing;
    default: {
      const unreachable: never = category;
      return unreachable;
    }
  }
}

export function parseStoredConsent(raw: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentRecord>;
    if (value.version !== CONSENT_VERSION) return null;
    if (typeof value.decidedAt !== 'string' || !value.decidedAt) return null;
    if (value.necessary !== true) return null;
    if (typeof value.functional !== 'boolean') return null;
    if (typeof value.analytics !== 'boolean') return null;
    if (typeof value.marketing !== 'boolean') return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: value.decidedAt,
      regime: value.regime === 'opt-out' ? 'opt-out' : 'opt-in',
      gpc: value.gpc === true,
      necessary: true,
      functional: value.functional,
      analytics: value.analytics,
      marketing: value.marketing,
    };
  } catch {
    return null;
  }
}

export function serializeConsent(record: ConsentRecord): string {
  return JSON.stringify(record);
}
