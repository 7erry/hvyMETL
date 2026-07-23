/** OpenAI-compatible function definitions for the hvyMETL agent copilot. */
import { COPILOT_MONGO_INSPECT_OPENAI_TOOLS } from './mongoInspectToolSchemas.js';
import { COPILOT_WORKFLOW_OPENAI_TOOLS } from './workflowToolSchemas.js';

export const COPILOT_CANVAS_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'foldTable',
      description: 'Embeds a child SQL table into a parent MongoDB collection via force-embed override.',
      parameters: {
        type: 'object',
        required: ['sourceTable', 'targetTable', 'embedType'],
        properties: {
          sourceTable: { type: 'string', description: 'Child table to embed' },
          targetTable: { type: 'string', description: 'Parent table / collection source' },
          embedType: {
            type: 'string',
            enum: ['array', 'single'],
            description: 'Embed as array or single subdocument',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'setEmbedOverride',
      description: 'Sets field-level BSON type overrides for a table (e.g. TIMESTAMPTZ -> Date).',
      parameters: {
        type: 'object',
        required: ['tableName', 'overrides'],
        properties: {
          tableName: { type: 'string' },
          overrides: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'highlightNodes',
      description: 'Focuses and selects table nodes on the ERD canvas.',
      parameters: {
        type: 'object',
        required: ['nodeIds'],
        properties: {
          nodeIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'detachTable',
      description: 'Reverts an embedded collection back to a top-level reference.',
      parameters: {
        type: 'object',
        required: ['tableName'],
        properties: {
          tableName: { type: 'string', description: 'Child table to detach from parent embed' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'runGuardrailCheck',
      description: 'Runs migration guardrail analysis on the current schema graph.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'translateSQLToMongo',
      description:
        'Translates SQL with JOINs/WHERE/ORDER BY to MongoDB aggregation based on current target schema.',
      parameters: {
        type: 'object',
        required: ['sqlQuery'],
        properties: {
          sqlQuery: { type: 'string' },
        },
      },
    },
  },
];

/** Canvas + workflow + MongoDB inspect tools sent to Grove when tool calling is enabled. */
export const COPILOT_OPENAI_TOOLS = [
  ...COPILOT_CANVAS_OPENAI_TOOLS,
  ...COPILOT_WORKFLOW_OPENAI_TOOLS,
  ...COPILOT_MONGO_INSPECT_OPENAI_TOOLS,
];

export type CopilotCanvasToolName =
  | 'foldTable'
  | 'setEmbedOverride'
  | 'highlightNodes'
  | 'detachTable'
  | 'runGuardrailCheck'
  | 'translateSQLToMongo';
