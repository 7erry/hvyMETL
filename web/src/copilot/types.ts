import { OPTIMIZE_SCHEMA_USER_PROMPT } from '../../../src/copilot/copilotArchitecturePrompt.js';

/** Agent status shown in the copilot header. */
export type AgentStatus = 'idle' | 'analyzing' | 'mutating';

/** Preset workflow modes for the agent. */
export type CopilotWorkflowPreset = 'schema-design' | 'guardrails' | 'query-translate' | 'self-heal';

export type CopilotMessageRole = 'user' | 'agent' | 'system';

export type CopilotToolName =
  | 'foldTable'
  | 'setEmbedOverride'
  | 'highlightNodes'
  | 'detachTable'
  | 'runGuardrailCheck'
  | 'translateSQLToMongo'
  | 'listMongoDatabases'
  | 'listMongoCollections'
  | 'describeMongoCollectionSchema'
  | 'listMongoCollectionIndexes'
  | 'findMongoDocuments'
  | 'aggregateMongoCollection'
  | 'explainMongoOperation'
  | 'compareMongoCollectionToPlan';

/** Tools executed server-side via the MongoDB MCP proxy. */
export type MongoInspectToolName =
  | 'listMongoDatabases'
  | 'listMongoCollections'
  | 'describeMongoCollectionSchema'
  | 'listMongoCollectionIndexes'
  | 'findMongoDocuments'
  | 'aggregateMongoCollection'
  | 'explainMongoOperation'
  | 'compareMongoCollectionToPlan';

export const MONGO_INSPECT_TOOL_NAMES = new Set<MongoInspectToolName>([
  'listMongoDatabases',
  'listMongoCollections',
  'describeMongoCollectionSchema',
  'listMongoCollectionIndexes',
  'findMongoDocuments',
  'aggregateMongoCollection',
  'explainMongoOperation',
  'compareMongoCollectionToPlan',
]);

export function isMongoInspectToolName(name: string): name is MongoInspectToolName {
  return MONGO_INSPECT_TOOL_NAMES.has(name as MongoInspectToolName);
}

/** One chat message in the copilot thread. */
export type CopilotMessage = {
  id: string;
  role: CopilotMessageRole;
  content: string;
  markdown?: boolean;
  createdAt: string;
  toolExecution?: ToolExecutionResult;
  codeBlocks?: { language: string; code: string }[];
  diffPreview?: { before: string; after: string };
};

/** Result returned after executing an agent tool on the canvas. */
export type ToolExecutionResult = {
  tool: CopilotToolName;
  summary: string;
  delta: string[];
  ok: boolean;
  /** Structured inspect payload from /api/copilot/mongo/inspect (logical DB names, collections, etc.). */
  data?: unknown;
  /** SQL translation payload when tool is translateSQLToMongo. */
  sqlTranslation?: SqlTranslationOutput;
};

export type FoldTableArgs = {
  sourceTable: string;
  targetTable: string;
  embedType: 'array' | 'single';
};

export type SetEmbedOverrideArgs = {
  tableName: string;
  overrides: Record<string, string>;
};

export type HighlightNodesArgs = {
  nodeIds: string[];
};

export type DetachTableArgs = {
  tableName: string;
};

export type TranslateSqlArgs = {
  sqlQuery: string;
};

export type AgentToolCall =
  | { tool: 'foldTable'; args: FoldTableArgs }
  | { tool: 'setEmbedOverride'; args: SetEmbedOverrideArgs }
  | { tool: 'highlightNodes'; args: HighlightNodesArgs }
  | { tool: 'detachTable'; args: DetachTableArgs }
  | { tool: 'runGuardrailCheck'; args: Record<string, never> }
  | { tool: 'translateSQLToMongo'; args: TranslateSqlArgs };

/** Guardrail severity for canvas badges and copilot prompts. */
export type GuardrailSeverity = 'warning' | 'critical' | 'info';

export type GuardrailIssue = {
  id: string;
  tableName: string;
  kind: 'unbounded-array' | 'document-size' | 'orphan-fk' | 'missing-pk';
  severity: GuardrailSeverity;
  label: string;
  detail: string;
  suggestedPrompt: string;
};

export type SqlTranslationOutput = {
  aggregationPipeline: string;
  mongooseScript: string;
  shellScript: string;
  indexRecommendations: string[];
};

/** OpenAI-compatible tool call from Grove chat completions. */
export type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

/** Message shape for /api/copilot/chat (OpenAI-compatible). */
export type CopilotLlmMessage = {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

export type CopilotChatApiResponse = {
  message: CopilotLlmMessage;
  finishReason: string | null;
};

export type CopilotStatusResponse = {
  configured: boolean;
  model: string;
  mongoInspect?: {
    enabled: boolean;
    available: boolean;
    message?: string;
  };
};

export type MongoInspectInvokeResponse = {
  ok: boolean;
  tool: MongoInspectToolName;
  summary: string;
  data?: unknown;
  error?: string;
  serviceUnavailable?: boolean;
};

export const COPILOT_SLASH_COMMANDS = [
  { command: '/fold', description: 'Embed a child table into a parent collection' },
  { command: '/guardrails', description: 'Run migration risk analysis' },
  { command: '/translate', description: 'Open SQL query translator' },
  { command: '/clear-overrides', description: 'Clear embed overrides' },
  { command: '/highlight', description: 'Highlight tables on the canvas' },
] as const;

export type CopilotQuickAction = {
  label: string;
  prompt: string;
};

export const QUICK_ACTION_CHIPS: CopilotQuickAction[] = [
  { label: 'Check Guardrails', prompt: 'Check Guardrails' },
  { label: 'Optimize Schema', prompt: OPTIMIZE_SCHEMA_USER_PROMPT },
  { label: 'Translate SQL', prompt: 'Translate SQL' },
];

export {
  COPILOT_WIDTH_DEFAULT,
  COPILOT_WIDTH_MAX,
  COPILOT_WIDTH_MIN,
} from '../layoutConstants.js';
