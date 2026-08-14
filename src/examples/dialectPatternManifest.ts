/**
 * Deterministic dialect → design-pattern assignments for bundled dialect examples.
 * Patterns are shuffled once with seed 20260711 so every dialect gets a unique
 * randomized pick while remaining reproducible in tests and docs.
 */

import { SUPPORTED_DIALECT_IDS, getDialectLabel } from '../dialects.js';
import type { PatternId } from '../types.js';

/** Design patterns emitted by the rule engine (excludes profile-only preallocation). */
export const DIALECT_EXAMPLE_PATTERNS: PatternId[] = [
  'embed',
  'reference',
  'bucket',
  'outlier',
  'extended-reference',
  'computed',
  'subset',
  'attribute',
  'polymorphic',
  'tree',
  'archive',
  'single-collection',
  'schema-versioning',
];

/** Recommended workload profile when loading a dialect example in Migration Studio. */
export const PATTERN_SUGGESTED_PROFILE: Partial<Record<PatternId, string>> = {
  embed: 'catalog',
  reference: 'mobile',
  bucket: 'iot',
  'time-series': 'iot',
  outlier: 'catalog',
  'extended-reference': 'catalog',
  computed: 'ledger',
  subset: 'catalog',
  attribute: 'catalog',
  polymorphic: 'cms',
  tree: 'catalog',
  archive: 'catalog',
  'single-collection': 'mobile',
  'schema-versioning': 'catalog',
};

/** Mulberry32 PRNG for reproducible shuffles. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with a fixed seed. */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

const SHUFFLED_DIALECTS = seededShuffle(SUPPORTED_DIALECT_IDS, 2_026_0711);
const SHUFFLED_PATTERNS = seededShuffle(DIALECT_EXAMPLE_PATTERNS, 2_026_0711);

/** One dialect example entry: dialect id, assigned pattern, suggested profile. */
export type DialectExampleEntry = {
  dialectId: string;
  pattern: PatternId;
  suggestedProfileId: string;
  /** Relative path under examples/dialects/ */
  fileName: string;
};

const NON_SQL_DIALECT_EXTENSIONS: Record<string, string> = {
  dynamodb: 'yaml',
  'json-schema': 'json',
};

/** Manual overrides when a committed dialect example uses a curated schema instead of the shuffled pattern. */
const DIALECT_MANIFEST_OVERRIDES: Partial<Record<string, Pick<DialectExampleEntry, 'pattern' | 'suggestedProfileId'>>> = {
  dynamodb: { pattern: 'bucket', suggestedProfileId: 'iot' },
};

/** Stable manifest: one randomized design pattern per supported dialect. */
export const DIALECT_PATTERN_MANIFEST: DialectExampleEntry[] = SHUFFLED_DIALECTS.map((dialectId, index) => {
  const pattern = SHUFFLED_PATTERNS[index % SHUFFLED_PATTERNS.length]!;
  const extension = NON_SQL_DIALECT_EXTENSIONS[dialectId] ?? 'sql';
  const override = DIALECT_MANIFEST_OVERRIDES[dialectId];
  const resolvedPattern = override?.pattern ?? pattern;
  return {
    dialectId,
    pattern: resolvedPattern,
    suggestedProfileId: override?.suggestedProfileId ?? PATTERN_SUGGESTED_PROFILE[resolvedPattern] ?? 'catalog',
    fileName: `${dialectId}.${extension}`,
  };
});

/** Short workload profile titles for Load example picker labels (`{Dialect} - {Profile}`). */
export const PROFILE_PICKER_LABELS: Record<string, string> = {
  catalog: 'Catalog',
  cms: 'CMS',
  iot: 'IoT',
  mobile: 'Mobile',
  ledger: 'Ledger',
};

/** Short pattern titles (used in docs and file headers). */
export const PATTERN_PICKER_LABELS: Record<PatternId, string> = {
  embed: 'Embed',
  reference: 'Reference',
  bucket: 'Bucket',
  'time-series': 'Time Series',
  outlier: 'Outlier',
  'extended-reference': 'Extended Reference',
  computed: 'Computed',
  subset: 'Subset',
  attribute: 'Attribute',
  polymorphic: 'Polymorphic',
  tree: 'Tree',
  archive: 'Archive',
  'single-collection': 'Single Collection',
  'schema-versioning': 'Schema Versioning',
  preallocation: 'Pre-allocation',
};

/** Human-readable Load example label for a dialect design-pattern bundle. */
export function dialectExamplePickerLabel(entry: DialectExampleEntry): string {
  const profileLabel =
    PROFILE_PICKER_LABELS[entry.suggestedProfileId] ??
    entry.suggestedProfileId.replace(/\b\w/g, (character) => character.toUpperCase());
  return `${getDialectLabel(entry.dialectId)} - ${profileLabel}`;
}

/** Lookup pattern assignment for a dialect id. */
export function dialectExampleFor(dialectId: string): DialectExampleEntry | undefined {
  return DIALECT_PATTERN_MANIFEST.find((entry) => entry.dialectId === dialectId);
}
