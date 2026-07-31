/**
 * Parses natural-language "create full text / MongoDB Search …" copilot commands.
 */

import type { AtlasSearchPattern } from './mongoAtlasSearchIndex.js';
import { parseVectorSearchIndexTarget } from './parseVectorSearchIndexCommand.js';

export type ParsedAtlasSearchIndexCommand = {
  collection: string;
  path?: string;
  database?: string;
  pattern: AtlasSearchPattern;
};

const CREATE_ATLAS_SEARCH_PREFIX =
  /^create\s+(?:an?\s+)?(?:(?:full[\s-]?text|mongodb|lexical|atlas)\s+(?:search\s+)?(?:index\s+)?on|(?:keyword|autocomplete|faceted)\s+(?:search\s+)?(?:index\s+)?on|search\s+index\s+on|full[\s-]?text\s+search\s+(?:index\s+)?on)\s+(.+?)\s*$/i;

const CREATE_ATLAS_SEARCH_INLINE =
  /create\s+(?:an?\s+)?(?:(?:full[\s-]?text|mongodb|lexical|atlas)\s+(?:search\s+)?(?:index\s+)?on|(?:keyword|autocomplete|faceted)\s+(?:search\s+)?(?:index\s+)?on|search\s+index\s+on|full[\s-]?text\s+search\s+(?:index\s+)?on)\s+([^\n.?!]+)/i;

/** Infer keyword vs autocomplete vs faceted from the user phrase. */
export function detectAtlasSearchPatternFromPhrase(input: string): AtlasSearchPattern {
  const lower = input.toLowerCase();
  if (/\bautocomplete\b/.test(lower)) return 'autocomplete';
  if (/\bfacet(?:ed)?\b/.test(lower)) return 'faceted';
  return 'keyword';
}

/** Map chat input like "create full text search index on products" to collection + pattern. */
export function parseDirectAtlasSearchIndexCommand(input: string): ParsedAtlasSearchIndexCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const pattern = detectAtlasSearchPatternFromPhrase(trimmed);

  const anchored = trimmed.match(CREATE_ATLAS_SEARCH_PREFIX);
  if (anchored?.[1]) {
    const target = parseVectorSearchIndexTarget(anchored[1]);
    if (!target) return null;
    return { ...target, pattern };
  }

  const inline = trimmed.match(CREATE_ATLAS_SEARCH_INLINE);
  if (inline?.[1]) {
    const target = parseVectorSearchIndexTarget(inline[1]);
    if (!target) return null;
    return { ...target, pattern };
  }

  return null;
}
