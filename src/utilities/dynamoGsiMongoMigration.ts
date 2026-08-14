/**
 * Map DynamoDB GSI projections to MongoDB compound indexes (covered queries)
 * and Atlas Search definitions (storedSource).
 */

import type { DynamoDbGsiModel } from '../types.js';
import { mongoFieldNameForColumn, toCamelCaseFromDelimited } from './mongoFieldNaming.js';
import type { ColumnModel } from '../types.js';

export type DynamoGsiMongoMigrationInput = {
  indexName: string;
  hashKeyAttribute: string;
  rangeKeyAttribute?: string;
  projectionType: DynamoDbGsiModel['projectionType'];
  nonKeyAttributes?: string[];
};

export type MongoCompoundIndexSpec = {
  /** Suggested MongoDB index name (snake_case). */
  name: string;
  /** Index keys ordered equality → sort → covered payload (ESR). */
  keys: Record<string, 1 | -1>;
  /** find() projection for a covered query (_id excluded). */
  coveredProjection: Record<string, 1>;
};

export type MongoCoveredFindExample = {
  filter: Record<string, unknown>;
  projection: Record<string, 0 | 1>;
  sort: Record<string, 1 | -1>;
};

export type MongoAtlasSearchGsiSpec = {
  indexName: string;
  definition: {
    mappings: {
      dynamic: false;
      fields: Record<string, { type: string; store: true }>;
    };
    storedSource: {
      include: string[];
    };
  };
  samplePipeline: Record<string, unknown>[];
};

/** Convert PascalCase DynamoDB attribute names (ContentId) to camelCase (contentId). */
export function toCamelCaseFromPascal(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** MongoDB field for a GSI hash/range attribute or a projected non-key attribute. */
export function mongoFieldNameForGsiAttribute(
  attributeName: string,
  gsi: Pick<DynamoGsiMongoMigrationInput, 'indexName' | 'hashKeyAttribute' | 'rangeKeyAttribute'>,
): string {
  if (attributeName === gsi.hashKeyAttribute) {
    return toCamelCaseFromDelimited(gsi.indexName);
  }
  if (gsi.rangeKeyAttribute && attributeName === gsi.rangeKeyAttribute) {
    return `${toCamelCaseFromDelimited(gsi.indexName)}SortKey`;
  }
  return toCamelCaseFromPascal(attributeName);
}

/** Build a stable snake_case index name from a DynamoDB GSI name. */
export function mongoIndexNameFromGsi(indexName: string): string {
  return indexName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/** Resolve projected MongoDB field paths for a GSI (keys + INCLUDE attributes). */
export function mongoProjectedFieldsForGsi(gsi: DynamoGsiMongoMigrationInput): string[] {
  const fields: string[] = [
    mongoFieldNameForGsiAttribute(gsi.hashKeyAttribute, gsi),
  ];
  if (gsi.rangeKeyAttribute) {
    fields.push(mongoFieldNameForGsiAttribute(gsi.rangeKeyAttribute, gsi));
  }
  if (gsi.projectionType === 'INCLUDE') {
    for (const attribute of gsi.nonKeyAttributes ?? []) {
      const mapped = mongoFieldNameForGsiAttribute(attribute, gsi);
      if (!fields.includes(mapped)) fields.push(mapped);
    }
  }
  return fields;
}

/** Infer a simple Atlas Search field type from a MongoDB field name. */
function atlasSearchFieldType(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.endsWith('at') || lower.includes('date') || lower.includes('timestamp')) return 'date';
  if (lower.endsWith('id') || lower.includes('status') || lower.includes('handle')) return 'token';
  if (lower.includes('text') || lower.includes('title') || lower.includes('comment')) return 'string';
  return 'token';
}

/**
 * Build a MongoDB compound index spec that supports covered queries for INCLUDE GSIs.
 * KEYS_ONLY and ALL projections are documented via coveredProjection size.
 */
export function buildMongoCompoundIndexFromGsi(
  gsi: DynamoGsiMongoMigrationInput,
  options?: { rangeSortDirection?: 1 | -1 },
): MongoCompoundIndexSpec {
  const rangeDirection = options?.rangeSortDirection ?? -1;
  const hashField = mongoFieldNameForGsiAttribute(gsi.hashKeyAttribute, gsi);
  const rangeField = gsi.rangeKeyAttribute
    ? mongoFieldNameForGsiAttribute(gsi.rangeKeyAttribute, gsi)
    : undefined;

  const keys: Record<string, 1 | -1> = { [hashField]: 1 };
  if (rangeField) keys[rangeField] = rangeDirection;

  const coveredProjection: Record<string, 1> = {};
  for (const field of mongoProjectedFieldsForGsi(gsi)) {
    coveredProjection[field] = 1;
  }

  if (gsi.projectionType === 'INCLUDE') {
    for (const field of Object.keys(coveredProjection)) {
      if (!(field in keys)) keys[field] = 1;
    }
  }

  return {
    name: mongoIndexNameFromGsi(gsi.indexName),
    keys,
    coveredProjection,
  };
}

/** Sample find() arguments that satisfy a covered query when INCLUDE projection is used. */
export function buildMongoCoveredFindFromGsi(
  gsi: DynamoGsiMongoMigrationInput,
  equalityValue: string,
  options?: { rangeSortDirection?: 1 | -1 },
): MongoCoveredFindExample {
  const compound = buildMongoCompoundIndexFromGsi(gsi, options);
  const hashField = mongoFieldNameForGsiAttribute(gsi.hashKeyAttribute, gsi);
  const rangeField = gsi.rangeKeyAttribute
    ? mongoFieldNameForGsiAttribute(gsi.rangeKeyAttribute, gsi)
    : undefined;

  const projection: Record<string, 0 | 1> = { _id: 0 };
  for (const field of Object.keys(compound.coveredProjection)) {
    projection[field] = 1;
  }

  const sort: Record<string, 1 | -1> = {};
  if (rangeField) {
    sort[rangeField] = compound.keys[rangeField] ?? -1;
  }

  return {
    filter: { [hashField]: equalityValue },
    projection,
    sort,
  };
}

/** Build an Atlas Search index definition with storedSource for a DynamoDB INCLUDE GSI. */
export function buildAtlasSearchIndexFromGsi(
  gsi: DynamoGsiMongoMigrationInput,
  searchIndexName?: string,
): MongoAtlasSearchGsiSpec {
  const storedFields = mongoProjectedFieldsForGsi(gsi);
  const fields: Record<string, { type: string; store: true }> = {};
  for (const field of storedFields) {
    fields[field] = { type: atlasSearchFieldType(field), store: true };
  }

  const hashField = mongoFieldNameForGsiAttribute(gsi.hashKeyAttribute, gsi);
  const resolvedIndexName = searchIndexName ?? mongoIndexNameFromGsi(gsi.indexName);
  const searchStage: Record<string, unknown> = {
    index: resolvedIndexName,
    compound: {
      filter: [
        {
          equals: {
            path: hashField,
            value: 'MOD#PENDING',
          },
        },
      ],
    },
    returnStoredSource: true,
  };
  if (gsi.rangeKeyAttribute) {
    searchStage.sort = {
      [mongoFieldNameForGsiAttribute(gsi.rangeKeyAttribute, gsi)]: -1,
    };
  }

  return {
    indexName: resolvedIndexName,
    definition: {
      mappings: {
        dynamic: false,
        fields,
      },
      storedSource: {
        include: storedFields,
      },
    },
    samplePipeline: [
      { $search: searchStage },
      {
        $project: {
          _id: 0,
          ...Object.fromEntries(storedFields.map((field) => [field, `$${field}`])),
        },
      },
    ],
  };
}

/** Convert parser GSI metadata into migration input (attribute names from CloudFormation). */
export function dynamoGsiMigrationInputFromModel(gsi: DynamoDbGsiModel): DynamoGsiMongoMigrationInput {
  return {
    indexName: gsi.indexName,
    hashKeyAttribute: gsi.hashKey,
    rangeKeyAttribute: gsi.rangeKey,
    projectionType: gsi.projectionType,
    nonKeyAttributes: gsi.nonKeyAttributes,
  };
}

/** Map GSI keys using hvyMETL column metadata (migration plan field names). */
export function mongoFieldNameForGsiColumn(column: ColumnModel): string {
  return mongoFieldNameForColumn(column);
}
