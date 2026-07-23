import type { ToolExecutionResult, WorkflowToolName } from './types';

export type WorkflowToolResult = Pick<ToolExecutionResult, 'tool' | 'summary' | 'delta' | 'ok'> & {
  delta?: string[];
};

export type CopilotWorkflowHandlers = {
  clearSession: () => void;
  importSchemaDdl: (args: { ddl: string; dialect?: string }) => Promise<Omit<WorkflowToolResult, 'tool'>>;
  importBuiltinExample: (exampleId: string) => Promise<Omit<WorkflowToolResult, 'tool'>>;
  refreshDesign: () => Promise<Omit<WorkflowToolResult, 'tool'>>;
  runPipeline: () => Omit<WorkflowToolResult, 'tool'>;
};

export type WorkflowToolCall =
  | { kind: 'workflow'; tool: 'clearSession'; args: Record<string, never> }
  | { kind: 'workflow'; tool: 'importSchemaDdl'; args: { ddl: string; dialect?: string } }
  | { kind: 'workflow'; tool: 'importBuiltinExample'; args: { exampleId: string } }
  | { kind: 'workflow'; tool: 'refreshDesign'; args: Record<string, never> }
  | { kind: 'workflow'; tool: 'runPipeline'; args: Record<string, never> };

const WORKFLOW_TOOL_NAMES = new Set<WorkflowToolName>([
  'clearSession',
  'importSchemaDdl',
  'importBuiltinExample',
  'refreshDesign',
  'runPipeline',
]);

export function isWorkflowToolName(name: string): name is WorkflowToolName {
  return WORKFLOW_TOOL_NAMES.has(name as WorkflowToolName);
}

export function isWorkflowToolCall(call: { kind?: string }): call is WorkflowToolCall {
  return call.kind === 'workflow';
}

/** Parses OpenAI workflow tool arguments into a typed workflow call. */
export function parseWorkflowToolCall(name: string, args: Record<string, unknown>): WorkflowToolCall | null {
  if (!isWorkflowToolName(name)) return null;

  switch (name) {
    case 'clearSession':
      return { kind: 'workflow', tool: 'clearSession', args: {} };
    case 'importSchemaDdl': {
      const ddl = String(args.ddl ?? '').trim();
      if (!ddl) return null;
      const dialect = typeof args.dialect === 'string' && args.dialect.trim() ? args.dialect.trim() : undefined;
      return { kind: 'workflow', tool: 'importSchemaDdl', args: { ddl, dialect } };
    }
    case 'importBuiltinExample': {
      const exampleId = String(args.exampleId ?? '').trim();
      if (!exampleId) return null;
      return { kind: 'workflow', tool: 'importBuiltinExample', args: { exampleId } };
    }
    case 'refreshDesign':
      return { kind: 'workflow', tool: 'refreshDesign', args: {} };
    case 'runPipeline':
      return { kind: 'workflow', tool: 'runPipeline', args: {} };
    default:
      return null;
  }
}

/** Runs one workflow tool against App-provided handlers. */
export async function executeWorkflowTool(
  call: WorkflowToolCall,
  handlers: CopilotWorkflowHandlers,
): Promise<ToolExecutionResult> {
  switch (call.tool) {
    case 'clearSession':
      handlers.clearSession();
      return {
        tool: 'clearSession',
        summary: 'Session cleared. Schema import dialog opened — paste DDL or pick a built-in example.',
        delta: ['session reset', 'schema import modal open'],
        ok: true,
      };
    case 'importSchemaDdl': {
      const outcome = await handlers.importSchemaDdl(call.args);
      return {
        tool: 'importSchemaDdl',
        summary: outcome.summary,
        delta: outcome.delta ?? (outcome.ok ? ['schema imported'] : []),
        ok: outcome.ok,
      };
    }
    case 'importBuiltinExample': {
      const outcome = await handlers.importBuiltinExample(call.args.exampleId);
      return {
        tool: 'importBuiltinExample',
        summary: outcome.summary,
        delta: outcome.delta ?? (outcome.ok ? ['example loaded'] : []),
        ok: outcome.ok,
      };
    }
    case 'refreshDesign': {
      const outcome = await handlers.refreshDesign();
      return {
        tool: 'refreshDesign',
        summary: outcome.summary,
        delta: outcome.delta ?? (outcome.ok ? ['design refreshed'] : []),
        ok: outcome.ok,
      };
    }
    case 'runPipeline': {
      const outcome = handlers.runPipeline();
      return {
        tool: 'runPipeline',
        summary: outcome.summary,
        delta: outcome.delta ?? ['pipeline panel opened'],
        ok: outcome.ok,
      };
    }
    default: {
      const _exhaustive: never = call;
      return _exhaustive;
    }
  }
}

export function workflowToolDisplayName(tool: WorkflowToolName): string {
  const names: Record<WorkflowToolName, string> = {
    clearSession: 'Clear Session',
    importSchemaDdl: 'Import SQL',
    importBuiltinExample: 'Import Example',
    refreshDesign: 'Refresh Design',
    runPipeline: 'Run Pipeline',
  };
  return names[tool];
}

/** Maps common chat phrases to workflow tool calls (bypasses LLM). */
export function parseDirectWorkflowCommand(input: string): WorkflowToolCall | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^(?:\/clear-session|clear\s+session)$/i.test(trimmed)) {
    return { kind: 'workflow', tool: 'clearSession', args: {} };
  }
  if (/^(?:\/refresh-design|refresh\s+design)$/i.test(trimmed)) {
    return { kind: 'workflow', tool: 'refreshDesign', args: {} };
  }
  if (/^(?:\/run-pipeline|run\s+pipeline)$/i.test(trimmed)) {
    return { kind: 'workflow', tool: 'runPipeline', args: {} };
  }
  if (/^(?:show\s+me\s+|list\s+|what\s+are\s+(?:the\s+)?)?databases?\??$/i.test(trimmed)) {
    return null;
  }
  if (/^(?:clear\s+session\s+and\s+)?import\s+(?:the\s+)?(?:oracle|analytics|cms|iot|ledger|mobile|catalog|personalization|singleview)\s+example$/i.test(trimmed)) {
    const match = trimmed.match(/(oracle(?:\/[\w.-]+)?|analytics|cms|iot|ledger|mobile|catalog|personalization|singleview)/i);
    if (match?.[1]) {
      return {
        kind: 'workflow',
        tool: 'importBuiltinExample',
        args: { exampleId: match[1].toLowerCase() },
      };
    }
  }

  return null;
}

/** Serializes workflow tool output for the LLM tool role message. */
export function serializeWorkflowToolResult(result: ToolExecutionResult): string {
  return JSON.stringify({
    ok: result.ok,
    tool: result.tool,
    summary: result.summary,
    delta: result.delta,
  });
}
