import {
  relationshipOverrideKey,
  type CardinalityOverrides,
  type ForceEmbedOverrides,
} from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';
import { analyzeMigrationRisks } from './guardrails';
import { translateSQLToMongo } from './sqlTranslator';
import type {
  AgentToolCall,
  CopilotToolName,
  DetachTableArgs,
  FoldTableArgs,
  HighlightNodesArgs,
  SetEmbedOverrideArgs,
  ToolExecutionResult,
  TranslateSqlArgs,
} from './types';
import type { MigrationPlan } from '../migrationPlanTypes';

/** JSON-schema-shaped definitions for agent tool calling (OpenAI / MCP compatible). */
export const AGENT_TOOL_SCHEMAS = {
  foldTable: {
    name: 'foldTable',
    description: 'Embeds a child SQL table into a parent MongoDB collection via force-embed override.',
    parameters: {
      type: 'object',
      required: ['sourceTable', 'targetTable', 'embedType'],
      properties: {
        sourceTable: { type: 'string', description: 'Child table to embed' },
        targetTable: { type: 'string', description: 'Parent table / collection source' },
        embedType: { type: 'string', enum: ['array', 'single'], description: 'Embed as array or single subdocument' },
      },
    },
  },
  setEmbedOverride: {
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
  highlightNodes: {
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
  detachTable: {
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
  runGuardrailCheck: {
    name: 'runGuardrailCheck',
    description: 'Runs migration guardrail analysis on the current schema graph.',
    parameters: { type: 'object', properties: {} },
  },
  translateSQLToMongo: {
    name: 'translateSQLToMongo',
    description: 'Translates SQL with JOINs/WHERE/ORDER BY to MongoDB aggregation based on current target schema.',
    parameters: {
      type: 'object',
      required: ['sqlQuery'],
      properties: {
        sqlQuery: { type: 'string' },
      },
    },
  },
} as const;

export type AgentToolContext = {
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  cardinalityOverrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  embedFieldOverrides: Record<string, Record<string, string>>;
};

export type AgentToolMutation = {
  cardinalityOverrides?: CardinalityOverrides;
  forceEmbedOverrides?: ForceEmbedOverrides;
  embedFieldOverrides?: Record<string, Record<string, string>>;
  highlightedTables?: string[];
  selectedTable?: string | null;
  guardrailIssues?: ReturnType<typeof analyzeMigrationRisks>;
  sqlTranslation?: ReturnType<typeof translateSQLToMongo>;
};

function findRelationship(model: SqlStructuralModel, sourceTable: string, targetTable: string) {
  return model.relationships.find(
    (rel) => rel.childTable === sourceTable && rel.parentTable === targetTable,
  );
}

function executeFoldTable(args: FoldTableArgs, ctx: AgentToolContext): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  if (!ctx.model) {
    return {
      result: { tool: 'foldTable', summary: 'No schema loaded', delta: [], ok: false },
      mutation: {},
    };
  }
  const rel = findRelationship(ctx.model, args.sourceTable, args.targetTable);
  if (!rel) {
    return {
      result: {
        tool: 'foldTable',
        summary: `No FK from ${args.sourceTable} to ${args.targetTable}`,
        delta: [],
        ok: false,
      },
      mutation: {},
    };
  }
  const key = relationshipOverrideKey(rel);
  const nextForce = { ...ctx.forceEmbedOverrides, [key]: true };
  const nextCardinality = { ...ctx.cardinalityOverrides };
  if (args.embedType === 'single') {
    nextCardinality[key] = 1;
  } else if (!nextCardinality[key]) {
    nextCardinality[key] = 100;
  }
  return {
    result: {
      tool: 'foldTable',
      summary: `Folded '${args.sourceTable}' → '${args.targetTable}' (${args.embedType})`,
      delta: [
        `forceEmbed[${key}] = true`,
        args.embedType === 'single' ? `maxChildren[${key}] = 1` : `maxChildren[${key}] = ${nextCardinality[key]}`,
      ],
      ok: true,
    },
    mutation: {
      forceEmbedOverrides: nextForce,
      cardinalityOverrides: nextCardinality,
      highlightedTables: [args.sourceTable, args.targetTable],
      selectedTable: args.targetTable,
    },
  };
}

function executeDetachTable(args: DetachTableArgs, ctx: AgentToolContext): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  if (!ctx.model) {
    return {
      result: { tool: 'detachTable', summary: 'No schema loaded', delta: [], ok: false },
      mutation: {},
    };
  }
  const rels = ctx.model.relationships.filter((rel) => rel.childTable === args.tableName);
  if (!rels.length) {
    return {
      result: { tool: 'detachTable', summary: `No relationships for ${args.tableName}`, delta: [], ok: false },
      mutation: {},
    };
  }
  const nextForce = { ...ctx.forceEmbedOverrides };
  const nextCardinality = { ...ctx.cardinalityOverrides };
  const delta: string[] = [];
  for (const rel of rels) {
    const key = relationshipOverrideKey(rel);
    delete nextForce[key];
    delete nextCardinality[key];
    delta.push(`cleared override ${key}`);
  }
  return {
    result: {
      tool: 'detachTable',
      summary: `Detached '${args.tableName}' to top-level reference`,
      delta,
      ok: true,
    },
    mutation: {
      forceEmbedOverrides: nextForce,
      cardinalityOverrides: nextCardinality,
      highlightedTables: [args.tableName],
      selectedTable: args.tableName,
    },
  };
}

function executeSetEmbedOverride(
  args: SetEmbedOverrideArgs,
  ctx: AgentToolContext,
): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  const next = {
    ...ctx.embedFieldOverrides,
    [args.tableName]: { ...(ctx.embedFieldOverrides[args.tableName] ?? {}), ...args.overrides },
  };
  const delta = Object.entries(args.overrides).map(([field, type]) => `${args.tableName}.${field} → ${type}`);
  return {
    result: {
      tool: 'setEmbedOverride',
      summary: `Updated ${delta.length} field override(s) on ${args.tableName}`,
      delta,
      ok: true,
    },
    mutation: { embedFieldOverrides: next, highlightedTables: [args.tableName], selectedTable: args.tableName },
  };
}

function executeHighlightNodes(args: HighlightNodesArgs): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  return {
    result: {
      tool: 'highlightNodes',
      summary: `Highlighted ${args.nodeIds.length} node(s)`,
      delta: args.nodeIds.map((id) => `highlight ${id}`),
      ok: true,
    },
    mutation: {
      highlightedTables: args.nodeIds,
      selectedTable: args.nodeIds[0] ?? null,
    },
  };
}

function executeGuardrailCheck(ctx: AgentToolContext): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  const issues = analyzeMigrationRisks(ctx.model);
  return {
    result: {
      tool: 'runGuardrailCheck',
      summary: `Found ${issues.length} guardrail issue(s)`,
      delta: issues.map((i) => `${i.label} on ${i.tableName}`),
      ok: true,
    },
    mutation: { guardrailIssues: issues },
  };
}

function executeTranslateSql(
  args: TranslateSqlArgs,
  ctx: AgentToolContext,
): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  const sqlTranslation = translateSQLToMongo({
    sqlQuery: args.sqlQuery,
    model: ctx.model,
    plan: ctx.plan,
  });
  return {
    result: {
      tool: 'translateSQLToMongo',
      summary: 'SQL translated to MongoDB aggregation pipeline',
      delta: [`pipeline stages: ${sqlTranslation.aggregationPipeline.split('\n').length} lines`],
      ok: true,
    },
    mutation: { sqlTranslation },
  };
}

/** Execute one agent tool call against live canvas state. */
export function executeAgentTool(
  call: AgentToolCall,
  ctx: AgentToolContext,
): { result: ToolExecutionResult; mutation: AgentToolMutation } {
  switch (call.tool) {
    case 'foldTable':
      return executeFoldTable(call.args, ctx);
    case 'detachTable':
      return executeDetachTable(call.args, ctx);
    case 'setEmbedOverride':
      return executeSetEmbedOverride(call.args, ctx);
    case 'highlightNodes':
      return executeHighlightNodes(call.args);
    case 'runGuardrailCheck':
      return executeGuardrailCheck(ctx);
    case 'translateSQLToMongo':
      return executeTranslateSql(call.args, ctx);
    default: {
      const _exhaustive: never = call;
      return _exhaustive;
    }
  }
}

/** Parse slash commands and quick actions into tool calls. */
export function parseCopilotCommand(input: string): AgentToolCall | { message: string } | null {
  const trimmed = input.trim();
  if (trimmed === '/guardrails' || trimmed === 'Check Guardrails') {
    return { tool: 'runGuardrailCheck', args: {} };
  }
  if (trimmed === '/clear-overrides') {
    return { message: '__clear_overrides__' };
  }
  if (trimmed === '/translate' || trimmed === 'Translate SQL') {
    return { message: '__open_translator__' };
  }
  const foldMatch = trimmed.match(/^\/fold\s+(\w+)\s+->\s+(\w+)(?:\s+(array|single))?$/i);
  if (foldMatch) {
    return {
      tool: 'foldTable',
      args: {
        sourceTable: foldMatch[1],
        targetTable: foldMatch[2],
        embedType: (foldMatch[3]?.toLowerCase() as 'array' | 'single') ?? 'array',
      },
    };
  }
  const highlightMatch = trimmed.match(/^\/highlight\s+(.+)$/i);
  if (highlightMatch) {
    return {
      tool: 'highlightNodes',
      args: { nodeIds: highlightMatch[1].split(/[\s,]+/).filter(Boolean) },
    };
  }
  return null;
}

export function toolDisplayName(tool: CopilotToolName): string {
  const names: Record<CopilotToolName, string> = {
    foldTable: 'Fold Table',
    setEmbedOverride: 'Set Embed Override',
    highlightNodes: 'Highlight Nodes',
    detachTable: 'Detach Table',
    runGuardrailCheck: 'Guardrail Check',
    translateSQLToMongo: 'Translate SQL',
    listMongoDatabases: 'List Databases',
    listMongoCollections: 'List Collections',
    describeMongoCollectionSchema: 'Collection Schema',
    listMongoCollectionIndexes: 'Collection Indexes',
    findMongoDocuments: 'Find Documents',
    aggregateMongoCollection: 'Aggregate',
    explainMongoOperation: 'Explain Query',
    compareMongoCollectionToPlan: 'Compare to Plan',
  };
  return names[tool];
}
