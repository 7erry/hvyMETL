import { cLanguage } from './c.js';
import { cppLanguage } from './cpp.js';
import { csharpLanguage } from './csharp.js';
import { goLanguage } from './go.js';
import { javaLanguage } from './java.js';
import { kotlinLanguage } from './kotlin.js';
import { nodeLanguage } from './node.js';
import { phpLanguage } from './php.js';
import { pythonLanguage } from './python.js';
import { rubyLanguage } from './ruby.js';
import { rustLanguage } from './rust.js';
import { scalaLanguage } from './scala.js';
import { swiftLanguage } from './swift.js';
import type { RepogenLanguage, RepogenLanguageId } from './types.js';

/** All MongoDB officially supported client languages (13). */
export const REPOGEN_LANGUAGES: RepogenLanguage[] = [
  nodeLanguage,
  pythonLanguage,
  goLanguage,
  javaLanguage,
  kotlinLanguage,
  csharpLanguage,
  rubyLanguage,
  phpLanguage,
  rustLanguage,
  scalaLanguage,
  swiftLanguage,
  cLanguage,
  cppLanguage,
];

/** Lookup table keyed by language id. */
export const REPOGEN_LANGUAGE_BY_ID: Record<RepogenLanguageId, RepogenLanguage> = Object.fromEntries(
  REPOGEN_LANGUAGES.map((language) => [language.id, language]),
) as Record<RepogenLanguageId, RepogenLanguage>;

/** Resolve a language id string to a generator (defaults to Node.js). */
export function getRepogenLanguage(languageId?: string): RepogenLanguage {
  const normalized = String(languageId ?? 'node').trim().toLowerCase() as RepogenLanguageId;
  const language = REPOGEN_LANGUAGE_BY_ID[normalized];
  if (!language) {
    const supported = REPOGEN_LANGUAGES.map((entry) => entry.id).join(', ');
    throw new Error(`Unsupported repogen language "${languageId}". Supported: ${supported}`);
  }
  return language;
}

export type { GeneratedFile, RepogenGenerateResult, RepogenLanguage, RepogenLanguageId } from './types.js';
