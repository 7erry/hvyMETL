import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDynamoDbCloudFormationToModel } from './dynamodbCloudFormationParser.js';
import {
  buildAtlasSearchIndexFromGsi,
  buildMongoCompoundIndexFromGsi,
  buildMongoCoveredFindFromGsi,
  dynamoGsiMigrationInputFromModel,
  mongoFieldNameForGsiAttribute,
  mongoProjectedFieldsForGsi,
  toCamelCaseFromPascal,
} from './dynamoGsiMongoMigration.js';

const CMS_TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../examples/dynamodb/cms-platform-table.yaml'),
  'utf8',
);

const GSI2_AUTHOR_MODERATION = {
  indexName: 'GSI2-Author-Moderation-Index',
  hashKeyAttribute: 'GSI2PK',
  rangeKeyAttribute: 'GSI2SK',
  projectionType: 'INCLUDE' as const,
  nonKeyAttributes: ['ContentId', 'Title', 'AuthorId', 'Status', 'CommentText', 'UserHandle', 'UpdatedAt'],
};

describe('toCamelCaseFromPascal', () => {
  it('converts DynamoDB PascalCase attributes to camelCase', () => {
    expect(toCamelCaseFromPascal('ContentId')).toBe('contentId');
    expect(toCamelCaseFromPascal('CommentText')).toBe('commentText');
    expect(toCamelCaseFromPascal('UpdatedAt')).toBe('updatedAt');
  });
});

describe('mongoFieldNameForGsiAttribute', () => {
  it('maps GSI2 Author Moderation keys to semantic MongoDB index fields', () => {
    expect(mongoFieldNameForGsiAttribute('GSI2PK', GSI2_AUTHOR_MODERATION)).toBe('gSI2AuthorModerationIndex');
    expect(mongoFieldNameForGsiAttribute('GSI2SK', GSI2_AUTHOR_MODERATION)).toBe(
      'gSI2AuthorModerationIndexSortKey',
    );
    expect(mongoFieldNameForGsiAttribute('ContentId', GSI2_AUTHOR_MODERATION)).toBe('contentId');
  });
});

describe('buildMongoCompoundIndexFromGsi', () => {
  it('orders equality, sort, then INCLUDE payload fields for covered queries', () => {
    const spec = buildMongoCompoundIndexFromGsi(GSI2_AUTHOR_MODERATION);
    const keyNames = Object.keys(spec.keys);

    expect(keyNames[0]).toBe('gSI2AuthorModerationIndex');
    expect(keyNames[1]).toBe('gSI2AuthorModerationIndexSortKey');
    expect(spec.keys.gSI2AuthorModerationIndexSortKey).toBe(-1);
    expect(keyNames).toContain('contentId');
    expect(keyNames).toContain('commentText');
    expect(spec.coveredProjection).toEqual({
      gSI2AuthorModerationIndex: 1,
      gSI2AuthorModerationIndexSortKey: 1,
      contentId: 1,
      title: 1,
      authorId: 1,
      status: 1,
      commentText: 1,
      userHandle: 1,
      updatedAt: 1,
    });
    expect(spec.name).toBe('gsi2_author_moderation_index');
  });

  it('builds a covered find with _id excluded and hash equality filter', () => {
    const find = buildMongoCoveredFindFromGsi(GSI2_AUTHOR_MODERATION, 'MOD#PENDING');
    expect(find.filter).toEqual({ gSI2AuthorModerationIndex: 'MOD#PENDING' });
    expect(find.projection._id).toBe(0);
    expect(find.projection.contentId).toBe(1);
    expect(find.projection.commentText).toBe(1);
    expect(find.sort).toEqual({ gSI2AuthorModerationIndexSortKey: -1 });
  });
});

describe('buildAtlasSearchIndexFromGsi', () => {
  it('includes storedSource paths for all projected CMS moderation fields', () => {
    const search = buildAtlasSearchIndexFromGsi(GSI2_AUTHOR_MODERATION, 'gsi2_author_moderation_search');
    expect(search.indexName).toBe('gsi2_author_moderation_search');
    expect(search.definition.storedSource.include).toEqual(mongoProjectedFieldsForGsi(GSI2_AUTHOR_MODERATION));
    expect(search.definition.mappings.fields.commentText).toEqual({ type: 'string', store: true });
    expect(search.definition.mappings.fields.updatedAt).toEqual({ type: 'date', store: true });

    const searchStage = search.samplePipeline[0]?.$search as Record<string, unknown>;
    expect(searchStage.returnStoredSource).toBe(true);
    expect((searchStage.compound as { filter: unknown[] }).filter[0]).toEqual({
      equals: { path: 'gSI2AuthorModerationIndex', value: 'MOD#PENDING' },
    });
  });
});

describe('dynamoGsiMigrationInputFromModel', () => {
  it('derives migration input from the bundled CMS CloudFormation template', () => {
    const model = parseDynamoDbCloudFormationToModel(CMS_TEMPLATE);
    const gsi = model.tables[0]?.dynamoDb?.globalSecondaryIndexes.find(
      (entry) => entry.indexName === 'GSI2-Author-Moderation-Index',
    );
    expect(gsi).toBeDefined();

    const input = dynamoGsiMigrationInputFromModel(gsi!);
    expect(input.nonKeyAttributes).toContain('CommentText');
    expect(buildMongoCompoundIndexFromGsi(input).coveredProjection.commentText).toBe(1);
  });
});
