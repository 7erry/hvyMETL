/**
 * OpenAI tool definition for classic MongoDB B-tree index creation.
 */

export const MONGO_CLASSIC_INDEX_TOOL_NAME = 'createMongoClassicIndex' as const;

export type MongoClassicIndexToolName = typeof MONGO_CLASSIC_INDEX_TOOL_NAME;

const LOGICAL_DB_PROPERTY = {
  type: 'string',
  description:
    'Logical database name (e.g. csv_to_atlas). Omit when the collection name exists in only one of your databases—the server resolves it automatically.',
};

/** OpenAI function for creating classic indexes via the studio API. */
export const COPILOT_MONGO_CLASSIC_INDEX_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: MONGO_CLASSIC_INDEX_TOOL_NAME,
      description:
        'Create a classic MongoDB B-tree index (createIndex) on a collection—for example { status: 1 } or compound { customerId: 1, createdAt: -1 }. Use when the user asks to create an index, createIndex, or pastes db.collection.createIndex({ ... }). This is for standard query indexes—not Atlas Vector Search (use createMongoAutoEmbedVectorIndex) or Atlas Search lexical indexes (use createMongoAtlasSearchIndex). Omit database when the collection name is unique across the tenant. Do not tell the user to run mongosh manually—this tool creates the index server-side.',
      parameters: {
        type: 'object',
        required: ['collection', 'keys'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name (e.g. journalEntries)' },
          keys: {
            type: 'object',
            description: 'Index key document, e.g. { status: 1 } or { customerId: 1, createdAt: -1 }',
            additionalProperties: {
              oneOf: [
                { type: 'number', enum: [1, -1] },
                { type: 'string', description: 'Index type such as text, 2dsphere, hashed' },
              ],
            },
          },
          options: {
            type: 'object',
            description: 'Optional createIndex options',
            properties: {
              name: { type: 'string', description: 'Explicit index name' },
              unique: { type: 'boolean' },
              sparse: { type: 'boolean' },
              background: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
];

export function isMongoClassicIndexToolName(value: string): value is MongoClassicIndexToolName {
  return value === MONGO_CLASSIC_INDEX_TOOL_NAME;
}
