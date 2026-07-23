import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { executeAgentTool, parseCopilotCommand, type AgentToolContext, type AgentToolMutation } from './agentTools';
import { analyzeMigrationRisks } from './guardrails';
import { parseOpenAiToolCall, isServerMongoInspectToolCall } from './llmTools';
import { buildMongoInspectDelta, serializeMongoInspectToolResult } from './mongoInspectDisplay';
import { buildSchemaContextPayload } from './schemaContext';
import { fetchCopilotStatus, invokeCopilotMongoInspect, sendCopilotChat } from '../api';
import type {
  AgentStatus,
  CopilotLlmMessage,
  CopilotMessage,
  CopilotWorkflowPreset,
  GuardrailIssue,
  MongoInspectToolName,
  SqlTranslationOutput,
  ToolExecutionResult,
} from './types';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { CardinalityOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';

export type CopilotContextValue = {
  open: boolean;
  width: number;
  setWidth: (width: number) => void;
  activeTab: 'chat' | 'translator';
  status: AgentStatus;
  preset: CopilotWorkflowPreset;
  messages: CopilotMessage[];
  guardrailIssues: GuardrailIssue[];
  highlightedTables: string[];
  embedFieldOverrides: Record<string, Record<string, string>>;
  sqlTranslation: SqlTranslationOutput | null;
  pipelineError: string | null;
  selfHealSuggestion: string | null;
  showDiffPreview: boolean;
  toolsEnabled: boolean;
  llmConfigured: boolean;
  llmModel: string | null;
  mongoInspectAvailable: boolean;
  mongoInspectMessage: string | null;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setActiveTab: (tab: 'chat' | 'translator') => void;
  setPreset: (preset: CopilotWorkflowPreset) => void;
  setToolsEnabled: (enabled: boolean) => void;
  setShowDiffPreview: (show: boolean) => void;
  sendMessage: (text: string) => void;
  openWithPrompt: (prompt: string) => void;
  openGuardrailPrompt: (issue: GuardrailIssue) => void;
  reportPipelineError: (error: string, suggestion?: string) => void;
  clearPipelineError: () => void;
  applySelfHeal: () => void;
  applyToolMutations: (mutation: AgentToolMutation) => void;
  translateSql: (sqlQuery: string) => void;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

function newMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type CopilotProviderProps = {
  children: ReactNode;
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  cardinalityOverrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  copilotWidth: number;
  onCopilotWidthChange: (width: number) => void;
  onApplyMutations: (mutation: AgentToolMutation) => void;
  onClearOverrides: () => void;
  onReRunPipeline?: () => void;
};

export function CopilotProvider({
  children,
  model,
  plan,
  cardinalityOverrides,
  forceEmbedOverrides,
  copilotWidth,
  onCopilotWidthChange,
  onApplyMutations,
  onClearOverrides,
  onReRunPipeline,
}: CopilotProviderProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'translator'>('chat');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [preset, setPreset] = useState<CopilotWorkflowPreset>('schema-design');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [guardrailIssues, setGuardrailIssues] = useState<GuardrailIssue[]>([]);
  const [highlightedTables, setHighlightedTables] = useState<string[]>([]);
  const [embedFieldOverrides, setEmbedFieldOverrides] = useState<Record<string, Record<string, string>>>({});
  const [sqlTranslation, setSqlTranslation] = useState<SqlTranslationOutput | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [selfHealSuggestion, setSelfHealSuggestion] = useState<string | null>(null);
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const [mongoInspectAvailable, setMongoInspectAvailable] = useState(false);
  const [mongoInspectMessage, setMongoInspectMessage] = useState<string | null>(null);
  const [llmHistory, setLlmHistory] = useState<CopilotLlmMessage[]>([]);

  useEffect(() => {
    fetchCopilotStatus()
      .then((status) => {
        setLlmConfigured(status.configured);
        setLlmModel(status.configured ? status.model : null);
        setMongoInspectAvailable(Boolean(status.mongoInspect?.enabled && status.mongoInspect.available));
        setMongoInspectMessage(status.mongoInspect?.message ?? null);
      })
      .catch(() => {
        setLlmConfigured(false);
        setLlmModel(null);
        setMongoInspectAvailable(false);
        setMongoInspectMessage(null);
      });
  }, []);

  useEffect(() => {
    if (!model) {
      setGuardrailIssues([]);
      return;
    }
    setGuardrailIssues(analyzeMigrationRisks(model));
  }, [model]);

  const toolContext: AgentToolContext = useMemo(
    () => ({
      model,
      plan,
      cardinalityOverrides,
      forceEmbedOverrides,
      embedFieldOverrides,
    }),
    [model, plan, cardinalityOverrides, forceEmbedOverrides, embedFieldOverrides],
  );

  const applyToolMutations = useCallback(
    (mutation: AgentToolMutation) => {
      if (mutation.guardrailIssues) setGuardrailIssues(mutation.guardrailIssues);
      if (mutation.highlightedTables) setHighlightedTables(mutation.highlightedTables);
      if (mutation.embedFieldOverrides) setEmbedFieldOverrides(mutation.embedFieldOverrides);
      if (mutation.sqlTranslation) setSqlTranslation(mutation.sqlTranslation);
      onApplyMutations(mutation);
    },
    [onApplyMutations],
  );

  const appendMessage = useCallback((message: Omit<CopilotMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [
      ...prev,
      { ...message, id: newMessageId(), createdAt: new Date().toISOString() },
    ]);
  }, []);

  const executeTool = useCallback(
    (call: Parameters<typeof executeAgentTool>[0]): ToolExecutionResult => {
      const { result, mutation } = executeAgentTool(call, toolContext);
      applyToolMutations(mutation);

      const isCanvasMutation =
        mutation.cardinalityOverrides !== undefined ||
        mutation.forceEmbedOverrides !== undefined ||
        mutation.embedFieldOverrides !== undefined;

      if (isCanvasMutation && model) {
        const guardrailMutation = executeAgentTool({ tool: 'runGuardrailCheck', args: {} }, {
          ...toolContext,
          ...mutation,
          forceEmbedOverrides: mutation.forceEmbedOverrides ?? toolContext.forceEmbedOverrides,
          cardinalityOverrides: mutation.cardinalityOverrides ?? toolContext.cardinalityOverrides,
          embedFieldOverrides: mutation.embedFieldOverrides ?? toolContext.embedFieldOverrides,
        }).mutation;
        if (guardrailMutation.guardrailIssues) {
          setGuardrailIssues(guardrailMutation.guardrailIssues);
        }
      }

      return result;
    },
    [applyToolMutations, model, toolContext],
  );

  const runTool = useCallback(
    (call: Parameters<typeof executeAgentTool>[0]) => {
      setStatus('mutating');
      const result = executeTool(call);
      appendMessage({
        role: 'agent',
        content: result.summary,
        toolExecution: result,
      });
      setStatus('idle');
      return result;
    },
    [appendMessage, executeTool],
  );

  const runMongoInspectTool = useCallback(
    async (tool: MongoInspectToolName, args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      try {
        const response = await invokeCopilotMongoInspect(tool, args);
        return {
          tool,
          summary: response.summary,
          delta: buildMongoInspectDelta(tool, response),
          ok: response.ok,
          data: response.data,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          tool,
          summary: message,
          delta: [],
          ok: false,
        };
      }
    },
    [],
  );

  const runLlmTurn = useCallback(
    async (history: CopilotLlmMessage[]): Promise<CopilotLlmMessage[]> => {
      const schemaContext = buildSchemaContextPayload({
        model,
        plan,
        cardinalityOverrides,
        forceEmbedOverrides,
        guardrailIssues,
      });

      let messages = [...history];
      const maxIterations = 6;

      for (let i = 0; i < maxIterations; i += 1) {
        setStatus(i === 0 ? 'analyzing' : 'mutating');
        const response = await sendCopilotChat({
          messages,
          schemaContext,
          toolsEnabled,
        });

        const assistant = response.message;
        messages = [...messages, assistant];

        if (assistant.content?.trim()) {
          appendMessage({
            role: 'agent',
            content: assistant.content.trim(),
            markdown: true,
          });
        }

        const toolCalls = assistant.tool_calls ?? [];
        if (!toolCalls.length) {
          setStatus('idle');
          return messages;
        }

        let inspectOnlyBatch = toolCalls.length > 0;

        for (const toolCall of toolCalls) {
          const parsed = parseOpenAiToolCall(toolCall);
          if (!parsed) {
            inspectOnlyBatch = false;
            continue;
          }

          if (isServerMongoInspectToolCall(parsed)) {
            const result = await runMongoInspectTool(parsed.tool, parsed.args);
            appendMessage({
              role: 'agent',
              content: '',
              toolExecution: result,
            });
            messages = [
              ...messages,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: serializeMongoInspectToolResult({
                  ok: result.ok,
                  tool: parsed.tool,
                  summary: result.summary,
                  data: result.data,
                }),
              },
            ];
            continue;
          }

          inspectOnlyBatch = false;
          const result = executeTool(parsed);
          appendMessage({
            role: 'agent',
            content: result.summary,
            toolExecution: result,
          });
          messages = [
            ...messages,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            },
          ];
        }

        if (inspectOnlyBatch) {
          setStatus('idle');
          return messages;
        }
      }

      setStatus('idle');
      return messages;
    },
    [
      appendMessage,
      cardinalityOverrides,
      executeTool,
      forceEmbedOverrides,
      guardrailIssues,
      model,
      plan,
      runMongoInspectTool,
      toolsEnabled,
    ],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      appendMessage({ role: 'user', content: trimmed });

      const parsed = parseCopilotCommand(trimmed);
      if (parsed && 'message' in parsed) {
        if (parsed.message === '__clear_overrides__') {
          onClearOverrides();
          setLlmHistory([]);
          appendMessage({ role: 'agent', content: 'Cleared all embed overrides.' });
          return;
        }
        if (parsed.message === '__open_translator__') {
          setActiveTab('translator');
          appendMessage({ role: 'agent', content: 'Opened Query Translator tab.' });
          return;
        }
      }

      if (parsed && 'tool' in parsed && toolsEnabled) {
        runTool(parsed);
        return;
      }

      if (llmConfigured) {
        setStatus('analyzing');
        const userTurn: CopilotLlmMessage = { role: 'user', content: trimmed };
        const nextHistory = [...llmHistory, userTurn];
        setLlmHistory(nextHistory);
        void runLlmTurn(nextHistory)
          .then((updated) => setLlmHistory(updated))
          .catch((error: unknown) => {
            setStatus('idle');
            appendMessage({
              role: 'agent',
              content: `Copilot error: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
        return;
      }

      setStatus('analyzing');
      window.setTimeout(() => {
        const issues = analyzeMigrationRisks(model);
        setGuardrailIssues(issues);
        appendMessage({
          role: 'agent',
          content:
            issues.length > 0
              ? `Analyzed schema: ${issues.length} guardrail issue(s). Use **Check Guardrails** or \`/guardrails\` to refresh canvas badges.`
              : 'Schema looks clean from guardrail heuristics. Set **GROVE_API_KEY** in .env for LLM responses, or use `/fold child -> parent` and **Query Translator**.',
          markdown: true,
        });
        setStatus('idle');
      }, 400);
    },
    [appendMessage, llmConfigured, llmHistory, model, onClearOverrides, runLlmTurn, runTool, toolsEnabled],
  );

  const openWithPrompt = useCallback(
    (prompt: string) => {
      setOpen(true);
      setActiveTab('chat');
      sendMessage(prompt);
    },
    [sendMessage],
  );

  const openGuardrailPrompt = useCallback(
    (issue: GuardrailIssue) => {
      setOpen(true);
      setActiveTab('chat');
      sendMessage(issue.suggestedPrompt);
    },
    [sendMessage],
  );

  const reportPipelineError = useCallback(
    (error: string, suggestion?: string) => {
      setPipelineError(error);
      setSelfHealSuggestion(suggestion ?? null);
      setOpen(true);
      setPreset('self-heal');
      appendMessage({
        role: 'system',
        content: `Pipeline failed:\n\`\`\`\n${error.slice(0, 1200)}\n\`\`\``,
        markdown: true,
      });
      if (suggestion) {
        appendMessage({
          role: 'agent',
          content: `**Self-healing suggestion:** ${suggestion}`,
          markdown: true,
        });
      }
    },
    [appendMessage],
  );

  const translateSql = useCallback(
    (sqlQuery: string) => {
      runTool({ tool: 'translateSQLToMongo', args: { sqlQuery } });
    },
    [runTool],
  );

  const value = useMemo<CopilotContextValue>(
    () => ({
      open,
      width: copilotWidth,
      setWidth: onCopilotWidthChange,
      activeTab,
      status,
      preset,
      messages,
      guardrailIssues,
      highlightedTables,
      embedFieldOverrides,
      sqlTranslation,
      pipelineError,
      selfHealSuggestion,
      showDiffPreview,
      toolsEnabled,
      llmConfigured,
      llmModel,
      mongoInspectAvailable,
      mongoInspectMessage,
      toggleOpen: () => setOpen((prev) => !prev),
      setOpen,
      setActiveTab,
      setPreset,
      setToolsEnabled,
      setShowDiffPreview,
      sendMessage,
      openWithPrompt,
      openGuardrailPrompt,
      reportPipelineError,
      clearPipelineError: () => {
        setPipelineError(null);
        setSelfHealSuggestion(null);
      },
      applySelfHeal: () => {
        if (selfHealSuggestion) {
          const parsed = parseCopilotCommand(selfHealSuggestion);
          if (parsed && 'tool' in parsed) {
            runTool(parsed);
          } else {
            appendMessage({ role: 'agent', content: selfHealSuggestion });
          }
        }
        onReRunPipeline?.();
        setPipelineError(null);
        setSelfHealSuggestion(null);
      },
      applyToolMutations,
      translateSql,
    }),
    [
      open,
      copilotWidth,
      onCopilotWidthChange,
      activeTab,
      status,
      preset,
      messages,
      guardrailIssues,
      highlightedTables,
      embedFieldOverrides,
      sqlTranslation,
      pipelineError,
      selfHealSuggestion,
      showDiffPreview,
      toolsEnabled,
      llmConfigured,
      llmModel,
      mongoInspectAvailable,
      mongoInspectMessage,
      sendMessage,
      openWithPrompt,
      openGuardrailPrompt,
      onReRunPipeline,
      applyToolMutations,
      translateSql,
      runTool,
      appendMessage,
    ],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error('useCopilot must be used within CopilotProvider');
  return ctx;
}

/** Safe hook when copilot is optional (e.g. TableNode badges). */
export function useCopilotOptional(): CopilotContextValue | null {
  return useContext(CopilotContext);
}
