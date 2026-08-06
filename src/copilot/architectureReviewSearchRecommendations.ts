/**
 * Heuristic Atlas Search vs Vector Search recommendations from collection field paths.
 */

export type SearchRecommendationKind =
  | 'atlas-search-autocomplete'
  | 'atlas-search-keyword'
  | 'atlas-search-faceted'
  | 'atlas-vector-search';

export type SearchFieldRecommendation = {
  field: string;
  kind: SearchRecommendationKind;
  summary: string;
};

const AUTocomplete_FIELD =
  /(?:^|_)(name|title|sku|label|product_name|productname|display_name|item_name|movie_title)(?:$|_)/i;
const KEYWORD_FIELD = /(?:^|_)(keywords|tags|search_text|full_text)(?:$|_)/i;
const FACET_FIELD =
  /(?:^|_)(category|categories|brand|status|type|genre|department|tag|rating|price_tier)(?:$|_)/i;
const VECTOR_FIELD =
  /(?:^|_)(description|summary|body|content|plot|bio|abstract|notes|overview|synopsis|details|review_text)(?:$|_)/i;

/** Classify a single string field path for architecture-review search guidance. */
export function classifyFieldForSearch(fieldName: string): SearchFieldRecommendation | null {
  const normalized = fieldName.trim();
  if (!normalized) return null;

  if (AUTocomplete_FIELD.test(normalized)) {
    return {
      field: normalized,
      kind: 'atlas-search-autocomplete',
      summary:
        'Atlas Search **autocomplete** on this field (typeahead / product or title lookup with optional fuzzy matching).',
    };
  }
  if (VECTOR_FIELD.test(normalized)) {
    return {
      field: normalized,
      kind: 'atlas-vector-search',
      summary:
        'Atlas **Vector Search** (autoEmbed) on this field for semantic search, RAG, and intent-based retrieval.',
    };
  }
  if (FACET_FIELD.test(normalized)) {
    return {
      field: normalized,
      kind: 'atlas-search-faceted',
      summary: 'Atlas Search **faceted** indexing for filters, category counts, and e-commerce navigation.',
    };
  }
  if (KEYWORD_FIELD.test(normalized)) {
    return {
      field: normalized,
      kind: 'atlas-search-keyword',
      summary: 'Atlas Search **keyword** full-text index with field score boosting.',
    };
  }
  return null;
}

/** Human-readable label for a recommendation kind. */
export function searchRecommendationKindLabel(kind: SearchRecommendationKind): string {
  switch (kind) {
    case 'atlas-search-autocomplete':
      return 'Atlas Search (autocomplete)';
    case 'atlas-search-keyword':
      return 'Atlas Search (keyword)';
    case 'atlas-search-faceted':
      return 'Atlas Search (faceted)';
    case 'atlas-vector-search':
      return 'Atlas Vector Search (autoEmbed)';
  }
}

/** Recommend search strategies for all string-like field names on a collection. */
export function recommendSearchForCollectionFields(
  collectionName: string,
  fieldNames: string[],
): Array<SearchFieldRecommendation & { collection: string }> {
  const out: Array<SearchFieldRecommendation & { collection: string }> = [];
  for (const field of fieldNames) {
    const rec = classifyFieldForSearch(field);
    if (rec) out.push({ collection: collectionName, ...rec });
  }
  return out;
}
