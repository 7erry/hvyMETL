/**
 * Atlas MongoDB Search (lexical) index definitions and sample $search / $searchMeta pipelines.
 * @see https://www.mongodb.com/docs/search/index/index-definitions/
 */

export const ATLAS_SEARCH_PATTERNS = ['keyword', 'autocomplete', 'faceted'] as const;

export type AtlasSearchPattern = (typeof ATLAS_SEARCH_PATTERNS)[number];

export type AtlasSearchFieldMapping =
  | { type: 'string' }
  | {
      type: 'autocomplete';
      maxGrams: number;
      minGrams: number;
      tokenization: 'edgeGram' | 'nGram';
    }
  | { type: 'stringFacet' }
  | { type: 'numberFacet' }
  | { type: 'dateFacet' };

export type MongoAtlasSearchIndexMappings = {
  dynamic: false;
  fields: Record<string, AtlasSearchFieldMapping>;
};

export type MongoAtlasSearchIndexDefinition = {
  mappings: MongoAtlasSearchIndexMappings;
};

export type MongoAtlasSearchKeywordConfig = {
  textPaths: string[];
};

export type MongoAtlasSearchAutocompleteConfig = {
  path: string;
  maxGrams: number;
  minGrams: number;
  tokenization: 'edgeGram' | 'nGram';
};

export type MongoAtlasSearchNumberFacetConfig = {
  path: string;
  boundaries: number[];
};

export type MongoAtlasSearchFacetedConfig = {
  textPath: string;
  stringFacetPaths: string[];
  numberFacets: MongoAtlasSearchNumberFacetConfig[];
};

export type MongoAtlasSearchIndexInput = {
  database?: string;
  collection: string;
  pattern: AtlasSearchPattern;
  name?: string;
  keyword?: MongoAtlasSearchKeywordConfig;
  autocomplete?: MongoAtlasSearchAutocompleteConfig;
  faceted?: MongoAtlasSearchFacetedConfig;
};

const FIELD_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const COLLECTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

function readFieldPath(value: unknown, label: string): string {
  const path = readNonEmptyString(value, label);
  if (!FIELD_PATH_PATTERN.test(path)) {
    throw new Error(`${label} must be a valid field path (letters, numbers, underscores, dots).`);
  }
  return path;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of field paths.`);
  }
  const paths = value.map((entry, index) => readFieldPath(entry, `${label}[${index}]`));
  return [...new Set(paths)];
}

function readPattern(value: unknown): AtlasSearchPattern {
  const raw = readNonEmptyString(value, 'pattern');
  if (!(ATLAS_SEARCH_PATTERNS as readonly string[]).includes(raw)) {
    throw new Error(`pattern must be one of: ${ATLAS_SEARCH_PATTERNS.join(', ')}.`);
  }
  return raw as AtlasSearchPattern;
}

function readAutocompleteConfig(body: Record<string, unknown>): MongoAtlasSearchAutocompleteConfig {
  const path = readFieldPath(body.path ?? body.autocompletePath, 'path');
  const maxGrams =
    typeof body.maxGrams === 'number' && Number.isFinite(body.maxGrams) ? body.maxGrams : 15;
  const minGrams =
    typeof body.minGrams === 'number' && Number.isFinite(body.minGrams) ? body.minGrams : 2;
  const tokenizationRaw = readOptionalNonEmptyString(body.tokenization) ?? 'edgeGram';
  if (tokenizationRaw !== 'edgeGram' && tokenizationRaw !== 'nGram') {
    throw new Error('tokenization must be edgeGram or nGram.');
  }
  return { path, maxGrams, minGrams, tokenization: tokenizationRaw };
}

function readNumberFacets(value: unknown): MongoAtlasSearchNumberFacetConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`numberFacets[${index}] must be an object with path and boundaries.`);
    }
    const record = entry as Record<string, unknown>;
    const path = readFieldPath(record.path, `numberFacets[${index}].path`);
    if (!Array.isArray(record.boundaries) || record.boundaries.length < 2) {
      throw new Error(`numberFacets[${index}].boundaries must be an array of at least two numbers.`);
    }
    const boundaries = record.boundaries.map((b, i) => {
      const num = typeof b === 'number' ? b : Number(b);
      if (!Number.isFinite(num)) {
        throw new Error(`numberFacets[${index}].boundaries[${i}] must be a number.`);
      }
      return num;
    });
    return { path, boundaries };
  });
}

function readFacetedConfig(body: Record<string, unknown>): MongoAtlasSearchFacetedConfig {
  const textPath = readFieldPath(body.textPath ?? body.path, 'textPath');
  const stringFacetPaths = readStringArray(
    body.stringFacetPaths ?? body.facetPaths,
    'stringFacetPaths',
  );
  const numberFacets = readNumberFacets(body.numberFacets);
  if (stringFacetPaths.length === 0 && numberFacets.length === 0) {
    throw new Error('faceted pattern requires at least one stringFacetPaths entry or numberFacets entry.');
  }
  return { textPath, stringFacetPaths, numberFacets };
}

/** Parse and validate a create Atlas Search (lexical) index request body. */
export function parseMongoAtlasSearchIndexInput(raw: unknown): MongoAtlasSearchIndexInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Request body must be an object.');
  }
  const body = raw as Record<string, unknown>;

  const database = readOptionalNonEmptyString(body.database);
  const collection = readNonEmptyString(body.collection, 'collection');
  if (!COLLECTION_NAME_PATTERN.test(collection)) {
    throw new Error('collection name is invalid.');
  }

  const pattern = readPattern(body.pattern);
  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;

  const base = {
    ...(database ? { database } : {}),
    collection,
    pattern,
    ...(name ? { name } : {}),
  };

  if (pattern === 'keyword') {
    const textPaths = readStringArray(
      body.textPaths ?? body.paths ?? (body.path ? [body.path] : undefined),
      'textPaths',
    );
    return { ...base, keyword: { textPaths } };
  }

  if (pattern === 'autocomplete') {
    return { ...base, autocomplete: readAutocompleteConfig(body) };
  }

  return { ...base, faceted: readFacetedConfig(body) };
}

/** Default Atlas Search index name for a pattern configuration. */
export function defaultAtlasSearchIndexName(input: MongoAtlasSearchIndexInput): string {
  if (input.pattern === 'keyword' && input.keyword) {
    const slug = input.keyword.textPaths.map((p) => p.replace(/\./g, '_')).join('_');
    return `search_keyword_${slug}`.slice(0, 120);
  }
  if (input.pattern === 'autocomplete' && input.autocomplete) {
    const slug = input.autocomplete.path.replace(/\./g, '_');
    return `search_autocomplete_${slug}`.slice(0, 120);
  }
  if (input.pattern === 'faceted') {
    return `search_faceted_${input.collection}`.slice(0, 120);
  }
  return `search_${input.collection}`;
}

/** Build lexical MongoDB Search index definition (mappings) for createSearchIndex. */
export function buildAtlasSearchIndexDefinition(
  input: MongoAtlasSearchIndexInput,
): MongoAtlasSearchIndexDefinition {
  const fields: Record<string, AtlasSearchFieldMapping> = {};

  if (input.pattern === 'keyword' && input.keyword) {
    for (const path of input.keyword.textPaths) {
      fields[path] = { type: 'string' };
    }
  } else if (input.pattern === 'autocomplete' && input.autocomplete) {
    const { path, maxGrams, minGrams, tokenization } = input.autocomplete;
    fields[path] = { type: 'autocomplete', maxGrams, minGrams, tokenization };
  } else if (input.pattern === 'faceted' && input.faceted) {
    const { textPath, stringFacetPaths, numberFacets } = input.faceted;
    fields[textPath] = { type: 'string' };
    for (const facetPath of stringFacetPaths) {
      fields[facetPath] = { type: 'stringFacet' };
    }
    for (const facet of numberFacets) {
      fields[facet.path] = { type: 'numberFacet' };
    }
  } else {
    throw new Error('Invalid pattern configuration.');
  }

  return {
    mappings: {
      dynamic: false,
      fields,
    },
  };
}

/** Sample keyword $search aggregation pipeline (products title + description). */
export function buildSampleKeywordSearchPipeline(
  indexName: string,
  textPaths: string[],
  options: { query?: string; limit?: number } = {},
): unknown[] {
  const query = options.query ?? 'ceramic coffee mug';
  const limit = options.limit ?? 10;
  return [
    {
      $search: {
        index: indexName,
        text: {
          query,
          path: textPaths.length === 1 ? textPaths[0]! : textPaths,
        },
      },
    },
    { $limit: limit },
  ];
}

/** Sample autocomplete $search pipeline with optional fuzzy matching. */
export function buildSampleAutocompleteSearchPipeline(
  indexName: string,
  path: string,
  options: { query?: string; limit?: number; fuzzyMaxEdits?: number } = {},
): unknown[] {
  const query = options.query ?? 'cofe';
  const limit = options.limit ?? 5;
  const fuzzyMaxEdits = options.fuzzyMaxEdits ?? 1;
  return [
    {
      $search: {
        index: indexName,
        autocomplete: {
          query,
          path,
          fuzzy: {
            maxEdits: fuzzyMaxEdits,
          },
        },
      },
    },
    { $limit: limit },
    {
      $project: {
        [path.split('.')[0] ?? path]: 1,
        score: { $meta: 'searchScore' },
      },
    },
  ];
}

/** Sample faceted $searchMeta pipeline (category + price range buckets). */
export function buildSampleFacetedSearchMetaPipeline(
  indexName: string,
  config: MongoAtlasSearchFacetedConfig,
  options: { query?: string } = {},
): unknown[] {
  const query = options.query ?? 'coffee';
  const facets: Record<string, unknown> = {};

  for (const path of config.stringFacetPaths) {
    facets[`${path}Facet`] = {
      type: 'string',
      path,
    };
  }

  for (const facet of config.numberFacets) {
    const key = `${facet.path}Ranges`;
    facets[key] = {
      type: 'number',
      path: facet.path,
      boundaries: facet.boundaries,
    };
  }

  return [
    {
      $searchMeta: {
        index: indexName,
        facet: {
          operator: {
            text: {
              query,
              path: config.textPath,
            },
          },
          facets,
        },
      },
    },
  ];
}

/** Pick the sample pipeline for a created index record. */
export function buildSampleAtlasSearchPipelineForInput(
  input: MongoAtlasSearchIndexInput,
  indexName: string,
): unknown[] {
  if (input.pattern === 'keyword' && input.keyword) {
    return buildSampleKeywordSearchPipeline(indexName, input.keyword.textPaths);
  }
  if (input.pattern === 'autocomplete' && input.autocomplete) {
    return buildSampleAutocompleteSearchPipeline(indexName, input.autocomplete.path);
  }
  if (input.pattern === 'faceted' && input.faceted) {
    return buildSampleFacetedSearchMetaPipeline(indexName, input.faceted);
  }
  return [];
}
