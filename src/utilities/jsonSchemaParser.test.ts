import { describe, expect, it } from 'vitest';
import { renderDialectExampleDdl } from '../examples/dialectExampleTemplates.js';
import { parseDdlToModel } from './ddlParser.js';
import { parseJsonSchemaDocuments, parseJsonSchemaToModel, renderJsonSchemaBundleText, looksLikeJsonSchemaImport } from './jsonSchemaParser.js';
import { parseSchemaImport, resolveSchemaImportDialect } from './schemaImport.js';

/** Address schema from https://json-schema.org/learn/json-schema-examples */
const ADDRESS_SCHEMA = {
  $id: 'https://example.com/address.schema.json',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  description: 'An address similar to http://microformats.org/wiki/h-card',
  type: 'object',
  properties: {
    postOfficeBox: { type: 'string' },
    extendedAddress: { type: 'string' },
    streetAddress: { type: 'string' },
    locality: { type: 'string' },
    region: { type: 'string' },
    postalCode: { type: 'string' },
    countryName: { type: 'string' },
  },
  required: ['locality', 'region', 'countryName'],
  dependentRequired: {
    postOfficeBox: ['streetAddress'],
    extendedAddress: ['streetAddress'],
  },
};

describe('parseJsonSchemaToModel', () => {
  it('parses a single JSON Schema object', () => {
    const model = parseJsonSchemaToModel(JSON.stringify(ADDRESS_SCHEMA));
    expect(model.tables).toHaveLength(1);
    expect(model.tables[0]?.name).toBe('address');
    expect(model.tables[0]?.primaryKey).toEqual(['locality', 'region', 'countryName']);
    expect(model.tables[0]?.columns.length).toBe(7);
  });

  it('parses a bundle with $ref relationships (blog post → author)', () => {
    const bundle = {
      schemas: [
        {
          $id: 'https://example.com/user-profile.schema.json',
          type: 'object',
          title: 'user_profiles',
          required: ['username', 'email'],
          properties: {
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        },
        {
          $id: 'https://example.com/blog-post.schema.json',
          type: 'object',
          title: 'blog_posts',
          required: ['title', 'content', 'author'],
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            publishedDate: { type: 'string', format: 'date-time' },
            author: { $ref: 'https://example.com/user-profile.schema.json' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
    };

    const model = parseJsonSchemaToModel(JSON.stringify(bundle));
    expect(model.tables.map((table) => table.name)).toEqual(['user_profiles', 'blog_posts']);
    expect(model.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentTable: 'user_profiles',
          childTable: 'blog_posts',
          fkColumn: 'author',
        }),
      ]),
    );
  });

  it('parses ecommerce-style $defs with $anchor refs (json-schema.org example)', () => {
    const ecommerce = {
      $id: 'https://example.com/ecommerce.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        product: {
          $anchor: 'ProductSchema',
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'number', minimum: 0 },
          },
        },
        order: {
          $anchor: 'OrderSchema',
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            items: {
              type: 'array',
              items: { $ref: '#ProductSchema' },
            },
          },
        },
      },
    };

    const model = parseJsonSchemaToModel(JSON.stringify(ecommerce));
    expect(model.tables.map((table) => table.name)).toEqual(['product', 'order']);
    expect(model.tables.find((table) => table.name === 'order')?.primaryKey).toEqual(['orderId']);
    expect(model.tables.find((table) => table.name === 'order')?.columns.some((column) => column.name === 'items')).toBe(
      true,
    );
  });

  it('routes json-schema dialect imports through parseSchemaImport', () => {
    const model = parseSchemaImport(JSON.stringify(ADDRESS_SCHEMA), 'json-schema', 'ddl:json-schema');
    expect(model.source).toBe('ddl:json-schema');
    expect(model.tables[0]?.name).toBe('address');
  });

  it('detects $defs-only JSON Schema documents', () => {
    const ecommerce = {
      $id: 'https://example.com/ecommerce.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        product: { type: 'object', properties: { name: { type: 'string' } } },
      },
    };
    expect(looksLikeJsonSchemaImport(JSON.stringify(ecommerce))).toBe(true);
  });

  it('auto-resolves JSON Schema when dialect is still postgresql', () => {
    const ecommerce = {
      $id: 'https://example.com/ecommerce.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        product: { type: 'object', properties: { name: { type: 'string' } } },
        order: { type: 'object', properties: { orderId: { type: 'string' } } },
      },
    };
    const text = JSON.stringify(ecommerce);
    expect(resolveSchemaImportDialect(text, 'postgresql')).toBe('json-schema');
    const model = parseSchemaImport(text, 'postgresql');
    expect(model.tables.map((table) => table.name)).toEqual(['product', 'order']);
  });

  it('parses JSON Schema when paste is prefixed with null or false (invalid whole-document JSON)', () => {
    const ecommerce = {
      $id: 'https://example.com/ecommerce.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        product: { type: 'object', properties: { name: { type: 'string' } } },
      },
    };
    const body = JSON.stringify(ecommerce);
    for (const prefix of ['null ', 'false', 'null']) {
      const model = parseJsonSchemaToModel(`${prefix}${body}`);
      expect(model.tables.map((table) => table.name)).toContain('product');
    }
  });

  it('expands nested objects and array-of-object items in a single document schema', () => {
    const productDocument = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['_id', 'data', 'meta'],
      properties: {
        _id: { type: 'string' },
        data: {
          type: 'object',
          required: ['StepId', 'productId'],
          properties: {
            StepId: { type: 'string' },
            productId: { type: 'string' },
            productNumber: { type: 'string' },
            ClassificationReferences: {
              type: 'array',
              items: {
                type: 'object',
                required: ['ClassificationID', 'Type'],
                properties: {
                  ClassificationID: { type: 'string' },
                  Type: { type: 'string' },
                },
              },
            },
            attributes: {
              type: 'object',
              required: ['ItemNumber', 'Active'],
              properties: {
                ItemNumber: { type: 'string' },
                Active: { type: 'string' },
                weight_TXT: {
                  type: 'object',
                  required: ['UnitID', 'Value'],
                  properties: {
                    UnitID: { type: 'string' },
                    Value: { type: 'string' },
                  },
                },
                EDP: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        meta: {
          type: 'object',
          required: ['source'],
          properties: {
            source: { type: 'string' },
            descriptionKeywords: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    };

    const model = parseJsonSchemaToModel(JSON.stringify(productDocument));
    const tableNames = model.tables.map((table) => table.name).sort();

    expect(tableNames).toEqual([
      'Document',
      'Document_data',
      'Document_data_ClassificationReferences',
      'Document_data_attributes',
      'Document_data_attributes_weight_TXT',
      'Document_meta',
    ]);

    const root = model.tables.find((table) => table.name === 'Document');
    expect(root?.primaryKey).toEqual(['_id']);
    expect(root?.columns.map((column) => column.name)).toEqual(['_id']);

    const data = model.tables.find((table) => table.name === 'Document_data');
    expect(data?.foreignKeys[0]).toMatchObject({
      column: 'Document_id',
      referencesTable: 'Document',
      referencesColumn: '_id',
    });
    expect(data?.columns.some((column) => column.name === 'ClassificationReferences')).toBe(false);
    expect(data?.columns.some((column) => column.name === 'productNumber')).toBe(true);

    const classifications = model.tables.find((table) => table.name === 'Document_data_ClassificationReferences');
    expect(classifications?.primaryKey).toEqual(['ClassificationID']);
    expect(classifications?.foreignKeys[0]?.referencesTable).toBe('Document_data');

    const attributes = model.tables.find((table) => table.name === 'Document_data_attributes');
    expect(attributes?.columns.some((column) => column.name === 'EDP')).toBe(true);
    expect(attributes?.columns.some((column) => column.name === 'weight_TXT')).toBe(false);

    expect(model.relationships.length).toBeGreaterThanOrEqual(5);
  });
});

describe('renderJsonSchemaBundleText', () => {
  it('round-trips embed-pattern DDL through JSON Schema bundle', () => {
    const ddl = renderDialectExampleDdl('sqlite', 'embed');
    const model = parseDdlToModel(ddl, 'ddl:sqlite');
    const jsonText = renderJsonSchemaBundleText(model, 'subset example');
    const documents = parseJsonSchemaDocuments(jsonText);
    expect(documents.length).toBeGreaterThanOrEqual(5);

    const roundTrip = parseJsonSchemaToModel(jsonText);
    expect(roundTrip.tables.map((table) => table.name.toLowerCase())).toEqual(
      expect.arrayContaining(['orders', 'order_lines']),
    );
  });
});
