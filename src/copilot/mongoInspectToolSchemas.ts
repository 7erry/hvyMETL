/** Read-only MongoDB inspect + analyze tools exposed to the Agent Copilot LLM (logical database names only). */

export const MONGO_INSPECT_TOOL_NAMES = [
  'listMongoDatabases',
  'listMongoCollections',
  'describeMongoCollectionSchema',
  'listMongoCollectionIndexes',
  'findMongoDocuments',
  'aggregateMongoCollection',
  'explainMongoOperation',
  'compareMongoCollectionToPlan',
] as const;

export type MongoInspectToolName = (typeof MONGO_INSPECT_TOOL_NAMES)[number];

const LOGICAL_DB_PROPERTY = {
  type: 'string',
  description:
    'Logical database name (e.g. mytrains). Omit when the collection name exists in only one of your databases—the server resolves it automatically.',
};

/** OpenAI function definitions for Phase 1 MongoDB inspect via MCP. */
export const COPILOT_MONGO_INSPECT_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'listMongoDatabases',
      description:
        'List MongoDB databases available to the signed-in user. Returns logical database names only.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listMongoCollections',
      description: 'List collections in one of the user MongoDB databases.',
      parameters: {
        type: 'object',
        required: ['database'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'describeMongoCollectionSchema',
      description: 'Infer a collection document schema from a sample of documents.',
      parameters: {
        type: 'object',
        required: ['collection'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
          sampleSize: {
            type: 'number',
            description: 'Number of documents to sample (default 50, max 100)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listMongoCollectionIndexes',
      description: 'List classic and Atlas Search indexes for a collection.',
      parameters: {
        type: 'object',
        required: ['collection'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'findMongoDocuments',
      description: 'Run a read-only find query against a collection (max 25 documents).',
      parameters: {
        type: 'object',
        required: ['collection'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
          filter: {
            type: 'object',
            description: 'MongoDB find filter document',
            additionalProperties: true,
          },
          projection: {
            type: 'object',
            description: 'MongoDB projection document',
            additionalProperties: true,
          },
          sort: {
            type: 'object',
            description: 'Sort document (field: 1 or -1)',
            additionalProperties: true,
          },
          limit: {
            type: 'number',
            description: 'Maximum documents to return (default 10, max 25)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'aggregateMongoCollection',
      description:
        'Run a read-only aggregation pipeline against a collection (max 20 stages, results capped at 50 documents).',
      parameters: {
        type: 'object',
        required: ['collection', 'pipeline'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
          pipeline: {
            type: 'array',
            description: 'MongoDB aggregation pipeline stages. Write stages such as $out and $merge are rejected.',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'explainMongoOperation',
      description:
        'Explain a find, count, or aggregate operation and return the winning plan (optionally with executionStats).',
      parameters: {
        type: 'object',
        required: ['collection', 'method'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
          method: {
            type: 'string',
            enum: ['find', 'count', 'aggregate'],
            description: 'Operation to explain',
          },
          filter: {
            type: 'object',
            description: 'Find/count filter document',
            additionalProperties: true,
          },
          projection: {
            type: 'object',
            description: 'Find projection document',
            additionalProperties: true,
          },
          sort: {
            type: 'object',
            description: 'Find sort document',
            additionalProperties: true,
          },
          limit: {
            type: 'number',
            description: 'Find limit (default 10, max 25)',
          },
          pipeline: {
            type: 'array',
            description: 'Aggregation pipeline when method is aggregate',
            items: { type: 'object', additionalProperties: true },
          },
          verbosity: {
            type: 'string',
            enum: ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution'],
            description: 'Explain verbosity (default queryPlanner; use executionStats for timing)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compareMongoCollectionToPlan',
      description:
        'Compare a live Atlas collection against the current hvyMETL migration plan (fields, embeds, indexes). Requires Refresh design first.',
      parameters: {
        type: 'object',
        required: ['collection'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name' },
        },
      },
    },
  },
];

/** MCP tool name invoked server-side for each copilot inspect tool. */
export const MONGO_INSPECT_MCP_TOOL_MAP: Record<MongoInspectToolName, string> = {
  listMongoDatabases: 'list-databases',
  listMongoCollections: 'list-collections',
  describeMongoCollectionSchema: 'collection-schema',
  listMongoCollectionIndexes: 'collection-indexes',
  findMongoDocuments: 'find',
  aggregateMongoCollection: 'aggregate',
  explainMongoOperation: 'explain',
  compareMongoCollectionToPlan: 'collection-schema',
};

export function isMongoInspectToolName(value: string): value is MongoInspectToolName {
  return (MONGO_INSPECT_TOOL_NAMES as readonly string[]).includes(value);
}
