import type { OpenAiToolCall } from './types';
import type { AgentToolCall, CopilotToolName } from './types';

const TOOL_NAMES = new Set<CopilotToolName>([
  'foldTable',
  'setEmbedOverride',
  'highlightNodes',
  'detachTable',
  'runGuardrailCheck',
  'translateSQLToMongo',
]);

/** Parses an OpenAI tool_call payload into a typed agent tool call. */
export function parseOpenAiToolCall(toolCall: OpenAiToolCall): AgentToolCall | null {
  const name = toolCall.function.name as CopilotToolName;
  if (!TOOL_NAMES.has(name)) return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return null;
  }

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
