import type { OpenAiToolCall } from './types';
import type { AgentToolCall, CopilotToolName, MongoInspectToolName } from './types';
import { isMongoInspectToolName } from './types';

const CANVAS_TOOL_NAMES = new Set<CopilotToolName>([
  'foldTable',
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

export type ParsedCopilotToolCall = AgentToolCall | ServerMongoInspectToolCall;

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

  if (!CANVAS_TOOL_NAMES.has(name as CopilotToolName)) return null;

  switch (name) {
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
