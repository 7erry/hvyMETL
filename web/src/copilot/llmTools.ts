import type { OpenAiToolCall } from './types';
import type { AgentToolCall, CopilotToolName, MongoInspectToolName, MongoVectorIndexToolName, MongoAtlasSearchIndexToolName, MongoClassicIndexToolName } from './types';
import { isMongoInspectToolName, isMongoVectorIndexToolName, isMongoAtlasSearchIndexToolName, isMongoClassicIndexToolName } from './types';
import { isWorkflowToolName, parseWorkflowToolCall, type WorkflowToolCall } from './workflowTools';

const CANVAS_TOOL_NAMES = new Set<CopilotToolName>([
  'foldTable',
  'foldAllTables',
  'setEmbedOverride',
  'highlightNodes',
  'detachTable',
  'runGuardrailCheck',
  'translateSQLToMongo',
]);

export type ServerMongoInspectToolCall = {
  kind: 'mongoInspect';
  tool: MongoInspectToolName;
  args: Record<string, unknown>;
};

export type ServerMongoVectorIndexToolCall = {
  kind: 'mongoVectorIndex';
  tool: MongoVectorIndexToolName;
  args: Record<string, unknown>;
};

export type ServerMongoAtlasSearchToolCall = {
  kind: 'mongoAtlasSearch';
  tool: MongoAtlasSearchIndexToolName;
  args: Record<string, unknown>;
};

export type ServerMongoClassicIndexToolCall = {
  kind: 'mongoClassicIndex';
  tool: MongoClassicIndexToolName;
  args: Record<string, unknown>;
};

export type ParsedCopilotToolCall = AgentToolCall | ServerMongoInspectToolCall | ServerMongoVectorIndexToolCall | ServerMongoAtlasSearchToolCall | ServerMongoClassicIndexToolCall | WorkflowToolCall;

/** Parses an OpenAI tool_call payload into a canvas or server-side inspect tool call. */
export function parseOpenAiToolCall(toolCall: OpenAiToolCall): ParsedCopilotToolCall | null {
  const name = toolCall.function.name;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (isMongoInspectToolName(name)) {
    return { kind: 'mongoInspect', tool: name, args };
  }

  if (isMongoVectorIndexToolName(name)) {
    return { kind: 'mongoVectorIndex', tool: name, args };
  }

  if (isMongoAtlasSearchIndexToolName(name)) {
    return { kind: 'mongoAtlasSearch', tool: name, args };
  }

  if (isMongoClassicIndexToolName(name)) {
    return { kind: 'mongoClassicIndex', tool: name, args };
  }

  if (isWorkflowToolName(name)) {
    return parseWorkflowToolCall(name, args);
  }

  if (!CANVAS_TOOL_NAMES.has(name as CopilotToolName)) return null;

  switch (name) {
    case 'foldAllTables':
      return { tool: 'foldAllTables', args: {} };
    case 'foldTable':
      return {
        tool: 'foldTable',
        args: {
          sourceTable: String(args.sourceTable ?? ''),
          targetTable: String(args.targetTable ?? ''),
          embedType: args.embedType === 'single' ? 'single' : 'array',
        },
      };
    case 'setEmbedOverride':
      return {
        tool: 'setEmbedOverride',
        args: {
          tableName: String(args.tableName ?? ''),
          overrides:
            args.overrides && typeof args.overrides === 'object'
              ? (args.overrides as Record<string, string>)
              : {},
        },
      };
    case 'highlightNodes':
      return {
        tool: 'highlightNodes',
        args: {
          nodeIds: Array.isArray(args.nodeIds) ? args.nodeIds.map(String) : [],
        },
      };
    case 'detachTable':
      return {
        tool: 'detachTable',
        args: { tableName: String(args.tableName ?? '') },
      };
    case 'runGuardrailCheck':
      return { tool: 'runGuardrailCheck', args: {} };
    case 'translateSQLToMongo':
      return {
        tool: 'translateSQLToMongo',
        args: { sqlQuery: String(args.sqlQuery ?? '') },
      };
    default:
      return null;
  }
}

export function isServerMongoInspectToolCall(
  call: ParsedCopilotToolCall,
): call is ServerMongoInspectToolCall {
  return 'kind' in call && call.kind === 'mongoInspect';
}

export function isServerMongoVectorIndexToolCall(
  call: ParsedCopilotToolCall,
): call is ServerMongoVectorIndexToolCall {
  return 'kind' in call && call.kind === 'mongoVectorIndex';
}

export function isServerMongoAtlasSearchToolCall(
  call: ParsedCopilotToolCall,
): call is ServerMongoAtlasSearchToolCall {
  return 'kind' in call && call.kind === 'mongoAtlasSearch';
}

export function isServerMongoClassicIndexToolCall(
  call: ParsedCopilotToolCall,
): call is ServerMongoClassicIndexToolCall {
  return 'kind' in call && call.kind === 'mongoClassicIndex';
}

export function isWorkflowToolCallParsed(call: ParsedCopilotToolCall): call is WorkflowToolCall {
  return 'kind' in call && call.kind === 'workflow';
}
