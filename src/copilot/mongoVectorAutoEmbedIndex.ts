/**
 * Atlas Vector Search autoEmbed index options and definition builder for Agent Copilot Phase 3.
 */

export const AUTO_EMBED_VOYAGE_MODELS = [
  'voyage-4-lite',
  'voyage-4',
  'voyage-4-large',
  'voyage-code-3',
] as const;

export type AutoEmbedVoyageModel = (typeof AUTO_EMBED_VOYAGE_MODELS)[number];

export const AUTO_EMBED_QUANTIZATION_TYPES = [
  'float',
  'scalar',
  'binary',
  'binaryNoRescore',
] as const;

export type AutoEmbedQuantizationType = (typeof AUTO_EMBED_QUANTIZATION_TYPES)[number];

export const AUTO_EMBED_DIMENSIONS = [256, 512, 1024, 2048] as const;

export type AutoEmbedDimension = (typeof AUTO_EMBED_DIMENSIONS)[number];

export const AUTO_EMBED_SIMILARITY_FUNCTIONS = ['cosine', 'dotProduct', 'euclidean'] as const;

export type AutoEmbedSimilarityFunction = (typeof AUTO_EMBED_SIMILARITY_FUNCTIONS)[number];

/** User-selected autoEmbed vector index settings (logical database name). */
export type MongoAutoEmbedVectorIndexInput = {
  database: string;
  collection: string;
  path: string;
  model: AutoEmbedVoyageModel;
  quantization: AutoEmbedQuantizationType;
  numDimensions: AutoEmbedDimension;
  similarity: AutoEmbedSimilarityFunction;
  name?: string;
};

export type AutoEmbedVectorSearchFieldDefinition = {
  type: 'autoEmbed';
  path: string;
  model: AutoEmbedVoyageModel;
  modality: 'text';
  numDimensions: AutoEmbedDimension;
  similarity: AutoEmbedSimilarityFunction;
  quantization: AutoEmbedQuantizationType;
};

export type AutoEmbedVectorSearchIndexDefinition = {
  fields: AutoEmbedVectorSearchFieldDefinition[];
};

const FIELD_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const COLLECTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function readEnum<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  const raw = readNonEmptyString(value, label);
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return raw as T[number];
}

function readDimension(value: unknown): AutoEmbedDimension {
  const num = typeof value === 'number' ? value : Number(value);
  if (!AUTO_EMBED_DIMENSIONS.includes(num as AutoEmbedDimension)) {
    throw new Error(`numDimensions must be one of: ${AUTO_EMBED_DIMENSIONS.join(', ')}.`);
  }
  return num as AutoEmbedDimension;
}

/** Parse and validate a create autoEmbed vector index request body. */
export function parseMongoAutoEmbedVectorIndexInput(raw: unknown): MongoAutoEmbedVectorIndexInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Request body must be an object.');
  }
  const body = raw as Record<string, unknown>;

  const database = readNonEmptyString(body.database, 'database');
  const collection = readNonEmptyString(body.collection, 'collection');
  if (!COLLECTION_NAME_PATTERN.test(collection)) {
    throw new Error('collection name is invalid.');
  }

  const path = readNonEmptyString(body.path, 'path');
  if (!FIELD_PATH_PATTERN.test(path)) {
    throw new Error('path must be a valid field path (letters, numbers, underscores, dots).');
  }

  const model = readEnum(body.model, AUTO_EMBED_VOYAGE_MODELS, 'model');
  const quantization = readEnum(body.quantization, AUTO_EMBED_QUANTIZATION_TYPES, 'quantization');
  const similarity = readEnum(body.similarity, AUTO_EMBED_SIMILARITY_FUNCTIONS, 'similarity');
  const numDimensions = readDimension(body.numDimensions);

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;

  return {
    database,
    collection,
    path,
    model,
    quantization,
    numDimensions,
    similarity,
    ...(name ? { name } : {}),
  };
}

/** Default Atlas search index name for an autoEmbed field configuration. */
export function defaultAutoEmbedVectorIndexName(input: Pick<MongoAutoEmbedVectorIndexInput, 'path' | 'model'>): string {
  const pathSlug = input.path.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
  const modelSlug = input.model.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `autoEmbed_${pathSlug}_${modelSlug}`;
}

/** Build the vectorSearch index definition payload for createSearchIndex. */
export function buildAutoEmbedVectorSearchIndexDefinition(
  input: MongoAutoEmbedVectorIndexInput,
): AutoEmbedVectorSearchIndexDefinition {
  return {
    fields: [
      {
        type: 'autoEmbed',
        path: input.path,
        model: input.model,
        modality: 'text',
        numDimensions: input.numDimensions,
        similarity: input.similarity,
        quantization: input.quantization,
      },
    ],
  };
}
