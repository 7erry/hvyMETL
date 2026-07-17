/**
 * Per-collection MongoDB validator schemas and OpenAPI 3 documents from migration plans.
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectionPlan, MigrationPlan } from '../types.js';

export type CollectionArtifactPaths = {
  schemasDir: string;
  openapiDir: string;
  combinedOpenApiPath: string;
  perCollection: { collection: string; schemaPath: string; openApiPath: string }[];
};

type BsonSchemaNode = Record<string, unknown>;

/** Convert MongoDB BSON JSON Schema nodes to standard JSON Schema for OpenAPI. */
export function bsonSchemaToJsonSchema(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return {};
  }

  const schema = node as BsonSchemaNode;
  const bsonType = schema.bsonType;

  if (Array.isArray(bsonType)) {
    const withoutNull = bsonType.filter((type) => type !== 'null');
    const base = bsonSchemaToJsonSchema({ ...schema, bsonType: withoutNull[0] ?? 'string' });
    if (bsonType.includes('null')) {
      return { ...base, nullable: true };
    }
    return base;
  }

  const description = schema.description;
  const withDescription = (body: Record<string, unknown>): Record<string, unknown> =>
    description ? { ...body, description } : body;

  switch (bsonType) {
    case 'string':
    case 'objectId':
      return withDescription({ type: 'string' });
    case 'int':
      return withDescription({ type: 'integer', format: 'int32' });
    case 'long':
      return withDescription({ type: 'integer', format: 'int64' });
    case 'double':
    case 'decimal':
      return withDescription({ type: 'number', format: 'double' });
    case 'bool':
      return withDescription({ type: 'boolean' });
    case 'date':
    case 'timestamp':
      return withDescription({ type: 'string', format: 'date-time' });
    case 'binData':
      return withDescription({ type: 'string', format: 'byte' });
    case 'object': {
      const properties = schema.properties as Record<string, unknown> | undefined;
      const converted: Record<string, unknown> = { type: 'object' };
      if (properties) {
        converted.properties = Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [key, bsonSchemaToJsonSchema(value)]),
        );
      }
      if (Array.isArray(schema.required)) {
        converted.required = schema.required;
      }
      if (schema.additionalProperties !== undefined) {
        converted.additionalProperties = schema.additionalProperties;
      }
      return withDescription(converted);
    }
    case 'array': {
      const items = schema.items;
      const converted: Record<string, unknown> = {
        type: 'array',
        items: items && typeof items === 'object' ? bsonSchemaToJsonSchema(items) : { type: 'object' },
      };
      return withDescription(converted);
    }
    default:
      return withDescription({ type: 'string' });
  }
}

/** MongoDB collection validator document (createCollection / collMod). */
export function buildCollectionValidatorDocument(collection: CollectionPlan, plan: MigrationPlan): Record<string, unknown> {
  return {
    collection: collection.name,
    sourceTable: collection.sourceTable,
    mergedTables: collection.mergedTables,
    profileId: plan.profileId,
    generatedAt: plan.generatedAt,
    validationLevel: 'moderate',
    validationAction: 'warn',
    validator: {
      $jsonSchema: collection.jsonSchema,
    },
    indexes: collection.indexes.map((index) => ({
      keys: index.keys,
      options: index.options,
      reason: index.reason,
    })),
  };
}

function toPascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** OpenAPI 3.0 document for REST access to one MongoDB collection. */
export function buildCollectionOpenApiDocument(collection: CollectionPlan, plan: MigrationPlan): Record<string, unknown> {
  const documentSchemaName = `${toPascalCase(collection.name)}Document`;
  const documentSchema = bsonSchemaToJsonSchema(collection.jsonSchema);
  const listSchema = {
    type: 'object',
    required: ['data'],
    properties: {
      data: { type: 'array', items: { $ref: `#/components/schemas/${documentSchemaName}` } },
      total: { type: 'integer', description: 'Total documents matching the filter (when available).' },
    },
  };
  const errorSchema = {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
    },
  };

  const collectionPath = `/${collection.name}`;
  const documentPath = `/${collection.name}/{id}`;

  return {
    openapi: '3.0.3',
    info: {
      title: `hvyMETL — ${collection.name}`,
      version: '1.0.0',
      description: [
        `REST contract for the MongoDB collection \`${collection.name}\`.`,
        `Source SQL table: \`${collection.sourceTable}\`.`,
        `Workload profile: ${plan.profileId}.`,
        'Generated by hvyMETL from the migration plan jsonSchema.',
      ].join('\n'),
    },
    tags: [{ name: collection.name, description: `Operations on ${collection.name}` }],
    paths: {
      [collectionPath]: {
        get: {
          tags: [collection.name],
          summary: `List ${collection.name} documents`,
          operationId: `list${toPascalCase(collection.name)}`,
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
            { name: 'skip', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Matching documents',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}List` } } },
            },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        post: {
          tags: [collection.name],
          summary: `Create a ${collection.name} document`,
          operationId: `create${toPascalCase(collection.name)}`,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
          },
          responses: {
            '201': {
              description: 'Document created',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
            },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      [documentPath]: {
        get: {
          tags: [collection.name],
          summary: `Get one ${collection.name} document by _id`,
          operationId: `get${toPascalCase(collection.name)}ById`,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Document _id (deterministic id from SQL primary key).',
            },
          ],
          responses: {
            '200': {
              description: 'Document found',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
            },
            '404': {
              description: 'Document not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        put: {
          tags: [collection.name],
          summary: `Replace a ${collection.name} document`,
          operationId: `replace${toPascalCase(collection.name)}ById`,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
          },
          responses: {
            '200': {
              description: 'Document replaced',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
            },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        patch: {
          tags: [collection.name],
          summary: `Partially update a ${collection.name} document`,
          operationId: `patch${toPascalCase(collection.name)}ById`,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Fields to update ($set semantics).',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Document updated',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${documentSchemaName}` } } },
            },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        delete: {
          tags: [collection.name],
          summary: `Delete a ${collection.name} document`,
          operationId: `delete${toPascalCase(collection.name)}ById`,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': { description: 'Document deleted' },
            default: {
              description: 'Error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        [documentSchemaName]: documentSchema,
        [`${documentSchemaName}List`]: listSchema,
        Error: errorSchema,
      },
    },
  };
}

/** Merge per-collection OpenAPI specs into one document (shared components). */
export function buildCombinedOpenApiDocument(plan: MigrationPlan): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {
    Error: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' },
      },
    },
  };
  const tags: { name: string; description: string }[] = [];

  for (const collection of plan.collections) {
    const single = buildCollectionOpenApiDocument(collection, plan);
    const singlePaths = single.paths as Record<string, unknown>;
    const singleSchemas = (single.components as { schemas: Record<string, unknown> }).schemas;
    Object.assign(paths, singlePaths);
    Object.assign(schemas, singleSchemas);
    tags.push({ name: collection.name, description: `Operations on ${collection.name}` });
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'hvyMETL Migration API',
      version: '1.0.0',
      description: `REST contracts for ${plan.collections.length} MongoDB collections (profile: ${plan.profileId}).`,
    },
    tags,
    paths,
    components: { schemas },
  };
}

/** Write schema + OpenAPI files for every collection in the plan. */
export function writeCollectionApiArtifacts(outDir: string, plan: MigrationPlan): CollectionArtifactPaths {
  const schemasDir = join(outDir, 'schemas');
  const openapiDir = join(outDir, 'openapi');
  mkdirSync(schemasDir, { recursive: true });
  mkdirSync(openapiDir, { recursive: true });

  const currentNames = new Set(plan.collections.map((collection) => collection.name));
  for (const fileName of existsSync(schemasDir) ? readdirSync(schemasDir) : []) {
    if (!fileName.endsWith('.schema.json')) continue;
    const name = fileName.replace(/\.schema\.json$/i, '');
    if (!currentNames.has(name)) unlinkSync(join(schemasDir, fileName));
  }
  for (const fileName of existsSync(openapiDir) ? readdirSync(openapiDir) : []) {
    if (!fileName.endsWith('.openapi.json')) continue;
    const name = fileName.replace(/\.openapi\.json$/i, '');
    if (!currentNames.has(name)) unlinkSync(join(openapiDir, fileName));
  }

  const perCollection: CollectionArtifactPaths['perCollection'] = [];

  for (const collection of plan.collections) {
    const schemaPath = join(schemasDir, `${collection.name}.schema.json`);
    const openApiPath = join(openapiDir, `${collection.name}.openapi.json`);
    writeFileSync(schemaPath, `${JSON.stringify(buildCollectionValidatorDocument(collection, plan), null, 2)}\n`);
    writeFileSync(openApiPath, `${JSON.stringify(buildCollectionOpenApiDocument(collection, plan), null, 2)}\n`);
    perCollection.push({ collection: collection.name, schemaPath, openApiPath });
  }

  const combinedOpenApiPath = join(outDir, 'openapi.json');
  writeFileSync(combinedOpenApiPath, `${JSON.stringify(buildCombinedOpenApiDocument(plan), null, 2)}\n`);

  return { schemasDir, openapiDir, combinedOpenApiPath, perCollection };
}
