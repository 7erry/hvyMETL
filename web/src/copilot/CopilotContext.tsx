import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { executeAgentTool, parseCopilotCommand, type AgentToolContext, type AgentToolMutation } from './agentTools';
import { analyzeMigrationRisks } from './guardrails';
import { parseOpenAiToolCall, isServerMongoInspectToolCall, isServerMongoVectorIndexToolCall, isServerMongoAtlasSearchToolCall, isWorkflowToolCallParsed } from './llmTools';
import {
  parseDirectMongoInspectCommand,
  shouldSuppressListMongoDatabasesDisplay,
  isInspectOnlyUserMessage,
  looksLikeInspectListingEcho,
} from './inspectCommandRouting';
import { isArchitectureReviewContent } from './architectureReviewExport';
import { parseDirectVectorSearchIndexCommand } from './vectorIndexCommandRouting';
import { parseDirectAtlasSearchIndexCommand } from './atlasSearchCommandRouting';
import { MongoAutoEmbedVectorIndexModal } from '../components/copilot/MongoAutoEmbedVectorIndexModal';
import { MongoAtlasSearchIndexModal } from '../components/copilot/MongoAtlasSearchIndexModal';
import {
  executeWorkflowTool,
  attachPostVerifyArchitectureReviewNextStep,
  isWorkflowToolName,
  nextStepToWorkflowCall,
  parseDirectWorkflowCommand,
  parseWorkflowToolCall,
  resolveWorkflowNextStep,
  serializeWorkflowToolResult,
  workflowToolDisplayName,
  type CopilotWorkflowHandlers,
} from './workflowTools';
import { buildCopilotHelpResponse, buildCopilotCommandsResponse, isCopilotCommandsQuestion, isCopilotHelpQuestion } from './copilotHelp';
import {
  buildNextStepMessage,
  isMigrationWorkflowGuideRequest,
  type CopilotAction,
} from './copilotActionLinks';
import {
  buildCopilotDatasetScaleResponse,
  isCopilotDatasetScaleQuestion,
} from '../../../src/copilot/copilotDatasetScale.ts';
import { buildDatasetScaleContext } from './buildDatasetScaleContext';
import { buildMongoInspectDelta, serializeMongoInspectToolResult } from './mongoInspectDisplay';
import { buildMongoPlanContext } from './mongoPlanContextPayload';
import { buildAggregateInspectArgs } from './runTranslationPipeline';
import { buildSchemaContextPayload } from './schemaContext';
import { serializeCanvasToolResult, toolExecutionHasStructuredOutput } from './toolExecutionDisplay';
import { fetchCopilotStatus, fetchPipelineConfig, createCopilotMongoAutoEmbedVectorIndex, createCopilotMongoAtlasSearchIndex, invokeCopilotMongoInspect, sendCopilotChat } from '../api';
import type { CopilotVectorSearchIndexRecord } from '../../../src/copilot/copilotVectorSearchContext.ts';
import { copilotVectorSearchIndexFromCreateResult } from '../../../src/copilot/copilotVectorSearchContext.ts';
import type { CopilotAtlasSearchIndexRecord } from '../../../src/copilot/copilotAtlasSearchContext.ts';
import type { AtlasSearchPattern } from '../../../src/copilot/mongoAtlasSearchIndex.ts';
import { copilotAtlasSearchIndexFromCreateResult } from '../../../src/copilot/copilotAtlasSearchContext.ts';
import {
  loadSessionVectorSearchIndexes,
  saveSessionVectorSearchIndexes,
} from './vectorSearchIndexSession';
import {
  loadSessionAtlasSearchIndexes,
  saveSessionAtlasSearchIndexes,
} from './atlasSearchIndexSession';
import type {
  AgentStatus,
  CopilotLlmMessage,
  CopilotMessage,
  CopilotNextStep,
  CopilotWorkflowPreset,
  GuardrailIssue,
  MongoInspectToolName,
  SqlTranslationOutput,
  ToolExecutionResult,
  WorkflowToolName,
} from './types';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { CardinalityOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';
import type { ManagerCostInputs } from '../managerCostEstimate';
import { DEFAULT_MANAGER_COST_INPUTS } from '../managerCostEstimate';
import { extractAtlasSizingHintsFromInspect } from '../sizing/extractAtlasSizingHints';

export type CopilotContextValue = {
  open: boolean;
  width: number;
  setWidth: (width: number) => void;
  activeTab: 'chat' | 'translator' | 'sizing';
  status: AgentStatus;
  preset: CopilotWorkflowPreset;
  messages: CopilotMessage[];
  guardrailIssues: GuardrailIssue[];
  highlightedTables: string[];
  embedFieldOverrides: Record<string, Record<string, string>>;
  sqlTranslation: SqlTranslationOutput | null;
  pipelineError: string | null;
  selfHealSuggestion: string | null;
  llmConfigured: boolean;
  llmModel: string | null;
  mongoInspectAvailable: boolean;
  mongoInspectMessage: string | null;
  /** Logical MongoDB database for pipeline imports and architecture review titles. */
  targetDatabase: string;
  /** Loaded migration plan used for architecture review Google Docs collection diagrams. */
  migrationPlan: MigrationPlan | null;
  /** Remember the logical database from the most recent successful pipeline import. */
  setTargetDatabase: (database: string) => void;
  /** autoEmbed vector search indexes created in this studio session. */
  vectorSearchIndexes: CopilotVectorSearchIndexRecord[];
  recordVectorSearchIndex: (entry: CopilotVectorSearchIndexRecord) => void;
  /** Lexical MongoDB Search indexes created in this studio session. */
  atlasSearchIndexes: CopilotAtlasSearchIndexRecord[];
  recordAtlasSearchIndex: (entry: CopilotAtlasSearchIndexRecord) => void;
  openVectorIndexDialog: (request: VectorIndexDialogRequest) => void;
  openAtlasSearchIndexDialog: (request: AtlasSearchDialogRequest) => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setActiveTab: (tab: 'chat' | 'translator' | 'sizing') => void;
  setPreset: (preset: CopilotWorkflowPreset) => void;
  sendMessage: (text: string) => void;
  openWithPrompt: (prompt: string) => void;
  openGuardrailPrompt: (issue: GuardrailIssue) => void;
  reportPipelineError: (error: string, suggestion?: string) => void;
  clearPipelineError: () => void;
  applySelfHeal: () => void;
  applyToolMutations: (mutation: AgentToolMutation) => void;
  translateSql: (sqlQuery: string) => void;
  /** Run a clickable copilot-action from markdown (workflow step, prompt, or inspect). */
  runCopilotAction: (action: CopilotAction) => void;
  /** Execute the translated aggregation pipeline against Atlas. */
  runSqlTranslationPipeline: (output?: SqlTranslationOutput) => Promise<ToolExecutionResult>;
  /** Run a one-click migration workflow follow-up from a tool result card. */
  runNextStep: (step: CopilotNextStep) => void;
  /** Append a workflow-style tool result card (e.g. after pipeline import completes). */
  showWorkflowResult: (result: ToolExecutionResult) => void;
  /** Registers the chat textarea focus handler (sidebar mounts/unmounts with open state). */
  registerChatInputFocus: (focus: (() => void) | null) => void;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

/** Target collection for the shared autoEmbed vector index dialog. */
export type VectorIndexDialogRequest = {
  /** Logical database when known; omit to resolve from collection name via inspect. */
  database?: string;
  collection: string;
  initialPath?: string;
  textFieldPaths?: string[];
};

/** Target collection for the shared MongoDB Search (lexical) index dialog. */
export type AtlasSearchDialogRequest = {
  database?: string;
  collection: string;
  pattern?: AtlasSearchPattern;
  initialPath?: string;
  textFieldPaths?: string[];
};

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
  workflowHandlers: CopilotWorkflowHandlers;
  managerCostInputs?: ManagerCostInputs;
  /** Called when Mongo inspect returns collection stats useful for Atlas Sizing. */
  onSizingAtlasHints?: (patch: { avgDocSizeKb?: number; secondaryIndexCount?: number }) => void;
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
  workflowHandlers,
  managerCostInputs = DEFAULT_MANAGER_COST_INPUTS,
  onSizingAtlasHints,
}: CopilotProviderProps) {
  const [open, setOpenState] = useState(false);
  const [activeTab, setActiveTabState] = useState<'chat' | 'translator' | 'sizing'>('chat');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [preset, setPreset] = useState<CopilotWorkflowPreset>('schema-design');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [guardrailIssues, setGuardrailIssues] = useState<GuardrailIssue[]>([]);
  const [highlightedTables, setHighlightedTables] = useState<string[]>([]);
  const [embedFieldOverrides, setEmbedFieldOverrides] = useState<Record<string, Record<string, string>>>({});
  const [sqlTranslation, setSqlTranslation] = useState<SqlTranslationOutput | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [selfHealSuggestion, setSelfHealSuggestion] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const [mongoInspectAvailable, setMongoInspectAvailable] = useState(false);
  const [mongoInspectMessage, setMongoInspectMessage] = useState<string | null>(null);
  const [targetDatabase, setTargetDatabase] = useState('csv_to_atlas');
  const [vectorSearchIndexes, setVectorSearchIndexes] = useState<CopilotVectorSearchIndexRecord[]>(() =>
    loadSessionVectorSearchIndexes(),
  );
  const [atlasSearchIndexes, setAtlasSearchIndexes] = useState<CopilotAtlasSearchIndexRecord[]>(() =>
    loadSessionAtlasSearchIndexes(),
  );
  const [vectorIndexModal, setVectorIndexModal] = useState<VectorIndexDialogRequest | null>(null);
  const [atlasSearchIndexModal, setAtlasSearchIndexModal] = useState<AtlasSearchDialogRequest | null>(null);

  const publishSizingAtlasHints = useCallback(
    (tool: MongoInspectToolName, data: unknown, ok: boolean) => {
      if (!ok || !onSizingAtlasHints) return;
      const patch = extractAtlasSizingHintsFromInspect(tool, data);
      if (patch) onSizingAtlasHints(patch);
    },
    [onSizingAtlasHints],
  );

  const recordVectorSearchIndex = useCallback((entry: CopilotVectorSearchIndexRecord) => {
    setVectorSearchIndexes((previous) => {
      const next = [
        ...previous.filter(
          (existing) =>
            !(
              existing.database === entry.database &&
              existing.collection === entry.collection &&
              existing.indexName === entry.indexName
            ),
        ),
        entry,
      ];
      saveSessionVectorSearchIndexes(next);
      return next;
    });
  }, []);

  const recordAtlasSearchIndex = useCallback((entry: CopilotAtlasSearchIndexRecord) => {
    setAtlasSearchIndexes((previous) => {
      const next = [
        ...previous.filter(
          (existing) =>
            !(
              existing.database === entry.database &&
              existing.collection === entry.collection &&
              existing.indexName === entry.indexName
            ),
        ),
        entry,
      ];
      saveSessionAtlasSearchIndexes(next);
      return next;
    });
  }, []);

  const openVectorIndexDialog = useCallback(
    (request: VectorIndexDialogRequest) => {
      const explicitDatabase = request.database?.trim();
      const pipelineDatabase = targetDatabase.trim();
      const database =
        explicitDatabase && explicitDatabase !== 'database'
          ? explicitDatabase
          : pipelineDatabase || undefined;
      setVectorIndexModal({ ...request, database });
    },
    [targetDatabase],
  );

  const openAtlasSearchIndexDialog = useCallback(
    (request: AtlasSearchDialogRequest) => {
      const explicitDatabase = request.database?.trim();
      const pipelineDatabase = targetDatabase.trim();
      const database =
        explicitDatabase && explicitDatabase !== 'database'
          ? explicitDatabase
          : pipelineDatabase || undefined;
      setAtlasSearchIndexModal({ ...request, database });
    },
    [targetDatabase],
  );

  const [llmHistory, setLlmHistory] = useState<CopilotLlmMessage[]>([]);
  const chatInputFocusRef = useRef<(() => void) | null>(null);
  const chatInputFocusTimersRef = useRef<number[]>([]);
  const prevTableCountRef = useRef(model?.tables.length ?? 0);
  const lastCompletedWorkflowToolRef = useRef<WorkflowToolName | null>(null);
  const skipSchemaImportNotifyRef = useRef(false);

  const registerChatInputFocus = useCallback((focus: (() => void) | null) => {
    chatInputFocusRef.current = focus;
  }, []);

  const scheduleChatInputFocus = useCallback(() => {
    chatInputFocusTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    chatInputFocusTimersRef.current = [];

    const attempt = () => {
      chatInputFocusRef.current?.();
    };

    attempt();
    requestAnimationFrame(attempt);
    for (const delayMs of [0, 50, 150, 320]) {
      chatInputFocusTimersRef.current.push(window.setTimeout(attempt, delayMs));
    }
  }, []);

  useEffect(() => {
    return () => {
      chatInputFocusTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (next) {
        scheduleChatInputFocus();
      }
    },
    [scheduleChatInputFocus],
  );

  const toggleOpen = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      if (next) {
        scheduleChatInputFocus();
      }
      return next;
    });
  }, [scheduleChatInputFocus]);

  const setActiveTab = useCallback(
    (tab: 'chat' | 'translator') => {
      setActiveTabState(tab);
      if (tab === 'chat') {
        scheduleChatInputFocus();
      }
    },
    [scheduleChatInputFocus],
  );

  useEffect(() => {
    if (open && activeTab === 'chat') {
      scheduleChatInputFocus();
    }
  }, [open, activeTab, scheduleChatInputFocus]);

  useEffect(() => {
    if (open && activeTab === 'chat' && status === 'idle') {
      scheduleChatInputFocus();
    }
  }, [open, activeTab, status, scheduleChatInputFocus]);

  useEffect(() => {
    fetchCopilotStatus()
      .then((status) => {
        setLlmConfigured(status.configured);
        setLlmModel(status.configured ? status.model : null);
        setMongoInspectAvailable(Boolean(status.mongoInspect?.enabled));
        setMongoInspectMessage(
          status.mongoInspect?.enabled && !status.mongoInspect.available
            ? (status.mongoInspect.message ?? null)
            : null,
        );
      })
      .catch(() => {
        setLlmConfigured(false);
        setLlmModel(null);
        setMongoInspectAvailable(false);
        setMongoInspectMessage(null);
      });

    fetchPipelineConfig()
      .then((config) => {
        if (config.defaultTargetDb.trim()) {
          setTargetDatabase(config.defaultTargetDb.trim());
        }
      })
      .catch(() => {
        // Keep default target database when pipeline config is unavailable.
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
    (
      call: Parameters<typeof executeAgentTool>[0],
      contextOverride?: Partial<AgentToolContext>,
    ): { result: ToolExecutionResult; mutation: AgentToolMutation } => {
      const ctx = { ...toolContext, ...contextOverride };
      const { result, mutation } = executeAgentTool(call, ctx);
      applyToolMutations(mutation);

      const isCanvasMutation =
        mutation.cardinalityOverrides !== undefined ||
        mutation.forceEmbedOverrides !== undefined ||
        mutation.embedFieldOverrides !== undefined;

      if (isCanvasMutation && model) {
        const guardrailMutation = executeAgentTool({ tool: 'runGuardrailCheck', args: {} }, {
          ...ctx,
          ...mutation,
          forceEmbedOverrides: mutation.forceEmbedOverrides ?? ctx.forceEmbedOverrides,
          cardinalityOverrides: mutation.cardinalityOverrides ?? ctx.cardinalityOverrides,
          embedFieldOverrides: mutation.embedFieldOverrides ?? ctx.embedFieldOverrides,
        }).mutation;
        if (guardrailMutation.guardrailIssues) {
          setGuardrailIssues(guardrailMutation.guardrailIssues);
        }
      }

      if (mutation.sqlTranslation) {
        result.sqlTranslation = mutation.sqlTranslation;
        result.data ??= mutation.sqlTranslation;
      }

      return { result, mutation };
    },
    [applyToolMutations, model, toolContext],
  );

  const runTool = useCallback(
    (call: Parameters<typeof executeAgentTool>[0]) => {
      setStatus('mutating');
      const { result } = executeTool(call);
      appendMessage({
        role: 'agent',
        content: toolExecutionHasStructuredOutput(result) ? '' : result.summary,
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
        const response = await invokeCopilotMongoInspect(tool, args, buildMongoPlanContext(plan));
        const result: ToolExecutionResult = {
          tool,
          summary: response.summary,
          delta: buildMongoInspectDelta(tool, response),
          ok: response.ok,
          data: response.data,
        };
        if (response.ok) {
          setMongoInspectMessage(null);
        }
        return attachPostVerifyArchitectureReviewNextStep(result, args);
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
    [plan],
  );

  const runMongoVectorIndexTool = useCallback(
    async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const tool = 'createMongoAutoEmbedVectorIndex' as const;
      try {
        const payload: Record<string, unknown> = { ...args };
        if (
          (typeof payload.database !== 'string' || !payload.database.trim()) &&
          targetDatabase.trim()
        ) {
          payload.database = targetDatabase.trim();
        }
        const response = await createCopilotMongoAutoEmbedVectorIndex(
          payload as import('../../../../src/copilot/mongoVectorAutoEmbedIndex.ts').MongoAutoEmbedVectorIndexInput,
        );
        const input = payload as import('../../../../src/copilot/mongoVectorAutoEmbedIndex.ts').MongoAutoEmbedVectorIndexInput;
        if (response.ok) {
          const recorded = copilotVectorSearchIndexFromCreateResult(
            {
              database: input.database,
              collection: input.collection,
              path: input.path,
              model: input.model,
              quantization: input.quantization,
              numDimensions: input.numDimensions,
              similarity: input.similarity,
            },
            response,
          );
          if (recorded) recordVectorSearchIndex(recorded);
        }
        return {
          tool,
          summary: response.summary,
          delta: response.indexName
            ? [`${response.database ?? ''}.${response.collection ?? ''} → ${response.indexName}`]
            : [],
          ok: response.ok,
          data: response,
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
    [targetDatabase, recordVectorSearchIndex],
  );

  const runMongoAtlasSearchTool = useCallback(
    async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const tool = 'createMongoAtlasSearchIndex' as const;
      try {
        const payload: Record<string, unknown> = { ...args };
        if (
          (typeof payload.database !== 'string' || !payload.database.trim()) &&
          targetDatabase.trim()
        ) {
          payload.database = targetDatabase.trim();
        }
        const response = await createCopilotMongoAtlasSearchIndex(
          payload as import('../../../../src/copilot/mongoAtlasSearchIndex.ts').MongoAtlasSearchIndexInput,
        );
        const input = payload as import('../../../../src/copilot/mongoAtlasSearchIndex.ts').MongoAtlasSearchIndexInput;
        if (response.ok) {
          const recorded = copilotAtlasSearchIndexFromCreateResult(input, {
            database: response.database,
            indexName: response.indexName,
            definition: response.definition as CopilotAtlasSearchIndexRecord['definition'] | undefined,
          });
          if (recorded) recordAtlasSearchIndex(recorded);
        }
        return {
          tool,
          summary: response.summary,
          delta: response.indexName
            ? [`${response.database ?? ''}.${response.collection ?? ''} → ${response.indexName} (${response.pattern ?? input.pattern})`]
            : [],
          ok: response.ok,
          data: response,
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
    [targetDatabase, recordAtlasSearchIndex],
  );

  const runMongoInspectDirect = useCallback(
    async (tool: MongoInspectToolName, args: Record<string, unknown>) => {
      setStatus('mutating');
      const result = await runMongoInspectTool(tool, args);
      publishSizingAtlasHints(result.tool, result.data, result.ok);
      appendMessage({
        role: 'agent',
        content: buildNextStepMessage(result.nextStep),
        toolExecution: result,
      });
      setStatus('idle');
    },
    [appendMessage, publishSizingAtlasHints, runMongoInspectTool],
  );

  const runWorkflowDirect = useCallback(
    async (call: Parameters<typeof executeWorkflowTool>[0]) => {
      setStatus('mutating');
      const result = await executeWorkflowTool(call, workflowHandlers);
      if (result.ok && isWorkflowToolName(result.tool)) {
        lastCompletedWorkflowToolRef.current = result.tool;
        if (result.tool === 'importSchemaDdl' || result.tool === 'importBuiltinExample') {
          skipSchemaImportNotifyRef.current = true;
        }
      }
      appendMessage({
        role: 'agent',
        content: buildNextStepMessage(result.nextStep),
        toolExecution: result,
      });
      setStatus('idle');
    },
    [appendMessage, workflowHandlers],
  );

  const runLlmTurn = useCallback(
    async (history: CopilotLlmMessage[]): Promise<CopilotLlmMessage[]> => {
      try {
      const schemaContext = buildSchemaContextPayload({
        model,
        plan,
        cardinalityOverrides,
        forceEmbedOverrides,
        guardrailIssues,
        managerCostInputs,
        targetDatabase,
        vectorSearchIndexes,
        atlasSearchIndexes,
      });

      const userMessage =
        [...history].reverse().find((entry) => entry.role === 'user')?.content.trim() ?? '';

      let messages = [...history];
      const maxIterations = 10;
      let structuredInspectOutputShown = false;
      let architectureReviewAppended = false;

      for (let i = 0; i < maxIterations; i += 1) {
        setStatus(i === 0 ? 'analyzing' : 'mutating');
        const response = await sendCopilotChat({
          messages,
          schemaContext,
        });

        const assistant = response.message;
        messages = [...messages, assistant];

        const toolCalls = assistant.tool_calls ?? [];
        const parsedBatch = toolCalls
          .map((toolCall) => parseOpenAiToolCall(toolCall))
          .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null);
        const suppressListMongoDatabases = shouldSuppressListMongoDatabasesDisplay(userMessage, parsedBatch);

        if (assistant.content?.trim() && !toolCalls.length) {
          const reviewContent = assistant.content.trim();
          const isReview = isArchitectureReviewContent(reviewContent);
          const suppressFollowUpProse =
            !isReview &&
            structuredInspectOutputShown &&
            (isInspectOnlyUserMessage(userMessage) || looksLikeInspectListingEcho(reviewContent));
          if (!suppressFollowUpProse) {
            appendMessage({
              role: 'agent',
              content: reviewContent,
              markdown: true,
            });
            if (isReview) architectureReviewAppended = true;
          }
        }

        if (!toolCalls.length) {
          setStatus('idle');
          return messages;
        }

        let canvasForceEmbed = forceEmbedOverrides;
        let canvasCardinality = cardinalityOverrides;
        let canvasEmbedFields = embedFieldOverrides;

        for (const toolCall of toolCalls) {
          const parsed = parseOpenAiToolCall(toolCall);
          if (!parsed) {
            continue;
          }

          if (isServerMongoInspectToolCall(parsed)) {
            if (parsed.tool === 'listMongoDatabases' && suppressListMongoDatabases) {
              messages = [
                ...messages,
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: serializeMongoInspectToolResult({
                    ok: true,
                    tool: 'listMongoDatabases',
                    summary:
                      'Skipped listing databases — the user already named a target database or listMongoCollections runs in the same turn.',
                    data: null,
                  }),
                },
              ];
              continue;
            }

            const result = await runMongoInspectTool(parsed.tool, parsed.args);
            if (result.ok) {
              publishSizingAtlasHints(parsed.tool, result.data, true);
            }
            if (toolExecutionHasStructuredOutput(result)) {
              structuredInspectOutputShown = true;
            }
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

          if (isServerMongoVectorIndexToolCall(parsed)) {
            const result = await runMongoVectorIndexTool(parsed.args);
            appendMessage({
              role: 'agent',
              content: result.ok ? '' : result.summary,
              toolExecution: result,
            });
            messages = [
              ...messages,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: result.ok,
                  tool: parsed.tool,
                  summary: result.summary,
                  indexName: (result.data as { indexName?: string } | undefined)?.indexName,
                }),
              },
            ];
            continue;
          }

          if (isServerMongoAtlasSearchToolCall(parsed)) {
            const result = await runMongoAtlasSearchTool(parsed.args);
            appendMessage({
              role: 'agent',
              content: result.ok ? '' : result.summary,
              toolExecution: result,
            });
            messages = [
              ...messages,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: result.ok,
                  tool: parsed.tool,
                  summary: result.summary,
                  indexName: (result.data as { indexName?: string } | undefined)?.indexName,
                  pattern: (result.data as { pattern?: string } | undefined)?.pattern,
                }),
              },
            ];
            continue;
          }

          if (isWorkflowToolCallParsed(parsed)) {
            const result = await executeWorkflowTool(parsed, workflowHandlers);
            appendMessage({
              role: 'agent',
              content: buildNextStepMessage(result.nextStep),
              toolExecution: result,
            });
            messages = [
              ...messages,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: serializeWorkflowToolResult(result),
              },
            ];
            continue;
          }

          const { result, mutation } = executeTool(parsed, {
            forceEmbedOverrides: canvasForceEmbed,
            cardinalityOverrides: canvasCardinality,
            embedFieldOverrides: canvasEmbedFields,
          });
          if (mutation.forceEmbedOverrides) canvasForceEmbed = mutation.forceEmbedOverrides;
          if (mutation.cardinalityOverrides) canvasCardinality = mutation.cardinalityOverrides;
          if (mutation.embedFieldOverrides) canvasEmbedFields = mutation.embedFieldOverrides;
          appendMessage({
            role: 'agent',
            content: toolExecutionHasStructuredOutput(result) ? '' : result.summary,
            toolExecution: result,
          });
          messages = [
            ...messages,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: serializeCanvasToolResult(result),
            },
          ];
        }
      }

      if (/Architecture Review/i.test(userMessage) && !architectureReviewAppended) {
        appendMessage({
          role: 'agent',
          content:
            'Inspect tools completed but the written **Architecture Review** did not appear. Click **Architecture Review** again or ask: *Continue the Architecture Review using the inspect results above.*',
          markdown: true,
        });
      }

      setStatus('idle');
      return messages;
      } catch (error) {
        setStatus('idle');
        throw error;
      }
    },
    [
      appendMessage,
      cardinalityOverrides,
      embedFieldOverrides,
      executeTool,
      forceEmbedOverrides,
      guardrailIssues,
      managerCostInputs,
      model,
      plan,
      runMongoInspectTool,
      runMongoVectorIndexTool,
      runMongoAtlasSearchTool,
      targetDatabase,
      vectorSearchIndexes,
      atlasSearchIndexes,
      publishSizingAtlasHints,
      workflowHandlers,
    ],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      appendMessage({ role: 'user', content: trimmed });

      if (isMigrationWorkflowGuideRequest(trimmed)) {
        appendMessage({
          role: 'agent',
          content: '',
          variant: 'workflow-guide',
        });
        return;
      }

      if (isCopilotHelpQuestion(trimmed)) {
        appendMessage({
          role: 'agent',
          content: buildCopilotHelpResponse(),
          markdown: true,
        });
        return;
      }

      if (isCopilotCommandsQuestion(trimmed)) {
        appendMessage({
          role: 'agent',
          content: buildCopilotCommandsResponse(),
          markdown: true,
        });
        return;
      }

      if (isCopilotDatasetScaleQuestion(trimmed)) {
        appendMessage({
          role: 'agent',
          content: buildCopilotDatasetScaleResponse(buildDatasetScaleContext(model, plan, managerCostInputs)),
          markdown: true,
        });
        return;
      }

      const directWorkflow = parseDirectWorkflowCommand(trimmed);
      if (directWorkflow) {
        void runWorkflowDirect(directWorkflow);
        return;
      }

      const directInspect = parseDirectMongoInspectCommand(trimmed);
      if (directInspect) {
        void runMongoInspectDirect(directInspect.tool, directInspect.args);
        return;
      }

      const directVectorIndex = parseDirectVectorSearchIndexCommand(trimmed);
      if (directVectorIndex) {
        if (!mongoInspectAvailable) {
          appendMessage({
            role: 'agent',
            content:
              'MongoDB inspect is disabled on this server. Enable HVYMETL_MCP_MONGODB_ENABLED to create vector indexes from the studio.',
          });
          return;
        }
        openVectorIndexDialog({
          ...(directVectorIndex.database?.trim()
            ? { database: directVectorIndex.database.trim() }
            : {}),
          collection: directVectorIndex.collection,
          initialPath: directVectorIndex.path,
        });
        appendMessage({
          role: 'agent',
          content: directVectorIndex.path
            ? `Configure the autoEmbed vector index on \`${directVectorIndex.collection}.${directVectorIndex.path}\` in the dialog.`
            : `Choose a text field for the autoEmbed vector index on \`${directVectorIndex.collection}\` in the dialog.`,
        });
        return;
      }

      const directAtlasSearchIndex = parseDirectAtlasSearchIndexCommand(trimmed);
      if (directAtlasSearchIndex) {
        if (!mongoInspectAvailable) {
          appendMessage({
            role: 'agent',
            content:
              'MongoDB inspect is disabled on this server. Enable HVYMETL_MCP_MONGODB_ENABLED to create search indexes from the studio.',
          });
          return;
        }
        openAtlasSearchIndexDialog({
          ...(directAtlasSearchIndex.database?.trim()
            ? { database: directAtlasSearchIndex.database.trim() }
            : {}),
          collection: directAtlasSearchIndex.collection,
          pattern: directAtlasSearchIndex.pattern,
          initialPath: directAtlasSearchIndex.path,
        });
        appendMessage({
          role: 'agent',
          content: directAtlasSearchIndex.path
            ? `Configure the MongoDB Search (${directAtlasSearchIndex.pattern}) index on \`${directAtlasSearchIndex.collection}.${directAtlasSearchIndex.path}\` in the dialog — select all fields to index.`
            : `Choose fields for the MongoDB Search (${directAtlasSearchIndex.pattern}) index on \`${directAtlasSearchIndex.collection}\` in the dialog (nothing is pre-selected).`,
        });
        return;
      }

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

      if (parsed && 'tool' in parsed) {
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
    [appendMessage, llmConfigured, llmHistory, managerCostInputs, model, mongoInspectAvailable, mongoInspectMessage, onClearOverrides, openAtlasSearchIndexDialog, openVectorIndexDialog, plan, runLlmTurn, runMongoInspectDirect, runWorkflowDirect, runTool, targetDatabase],
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

  const runCopilotAction = useCallback(
    (action: CopilotAction) => {
      if (action.type === 'prompt') {
        sendMessage(action.prompt);
        return;
      }
      if (action.type === 'workflow') {
        const call = parseWorkflowToolCall(action.tool, action.args ?? {});
        if (call) {
          appendMessage({ role: 'user', content: workflowToolDisplayName(action.tool) });
          void runWorkflowDirect(call);
        }
        return;
      }
      appendMessage({ role: 'user', content: action.tool });
      void runMongoInspectDirect(action.tool, action.args);
    },
    [appendMessage, runMongoInspectDirect, runWorkflowDirect, sendMessage],
  );

  const runNextStep = useCallback(
    (step: CopilotNextStep) => {
      if (step.kind === 'prompt') {
        sendMessage(step.prompt);
        return;
      }
      appendMessage({ role: 'user', content: step.label });
      if (step.kind === 'workflow') {
        const call = nextStepToWorkflowCall(step);
        if (call) {
          void runWorkflowDirect(call);
        }
        return;
      }
      void runMongoInspectDirect(step.tool, step.args);
    },
    [appendMessage, runMongoInspectDirect, runWorkflowDirect, sendMessage],
  );

  const showWorkflowResult = useCallback(
    (result: ToolExecutionResult) => {
      if (result.ok && isWorkflowToolName(result.tool)) {
        lastCompletedWorkflowToolRef.current = result.tool;
      }
      appendMessage({
        role: 'agent',
        content: buildNextStepMessage(result.nextStep),
        toolExecution: result,
      });
    },
    [appendMessage],
  );

  useEffect(() => {
    const count = model?.tables.length ?? 0;
    const previousCount = prevTableCountRef.current;
    if (
      count > previousCount &&
      lastCompletedWorkflowToolRef.current === 'clearSession' &&
      !skipSchemaImportNotifyRef.current
    ) {
      showWorkflowResult({
        tool: 'importSchemaDdl',
        summary: `Step 2 complete: imported ${count} table(s).`,
        delta: [`tables: ${count}`],
        ok: true,
        nextStep: resolveWorkflowNextStep('importSchemaDdl'),
      });
      lastCompletedWorkflowToolRef.current = 'importSchemaDdl';
    }
    prevTableCountRef.current = count;
    skipSchemaImportNotifyRef.current = false;
  }, [model?.tables.length, showWorkflowResult]);

  const translateSql = useCallback(
    (sqlQuery: string) => {
      runTool({ tool: 'translateSQLToMongo', args: { sqlQuery } });
    },
    [runTool],
  );

  const runSqlTranslationPipeline = useCallback(
    async (output?: SqlTranslationOutput): Promise<ToolExecutionResult> => {
      const translation = output ?? sqlTranslation;
      if (!translation) {
        return {
          tool: 'aggregateMongoCollection',
          summary: 'Translate SQL first to generate an aggregation pipeline.',
          delta: [],
          ok: false,
        };
      }

      setStatus('mutating');
      try {
        const args = buildAggregateInspectArgs(translation);
        return await runMongoInspectTool('aggregateMongoCollection', args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          tool: 'aggregateMongoCollection',
          summary: message,
          delta: [],
          ok: false,
        };
      } finally {
        setStatus('idle');
      }
    },
    [runMongoInspectTool, sqlTranslation],
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
      llmConfigured,
      llmModel,
      mongoInspectAvailable,
      mongoInspectMessage,
      targetDatabase,
      migrationPlan: plan,
      setTargetDatabase,
      vectorSearchIndexes,
      recordVectorSearchIndex,
      atlasSearchIndexes,
      recordAtlasSearchIndex,
      openVectorIndexDialog,
      openAtlasSearchIndexDialog,
      toggleOpen,
      setOpen,
      setActiveTab,
      setPreset,
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
      runSqlTranslationPipeline,
      runCopilotAction,
      runNextStep,
      showWorkflowResult,
      registerChatInputFocus,
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
      llmConfigured,
      llmModel,
      mongoInspectAvailable,
      mongoInspectMessage,
      targetDatabase,
      plan,
      setTargetDatabase,
      vectorSearchIndexes,
      recordVectorSearchIndex,
      atlasSearchIndexes,
      recordAtlasSearchIndex,
      openVectorIndexDialog,
      openAtlasSearchIndexDialog,
      toggleOpen,
      setOpen,
      setActiveTab,
      sendMessage,
      openWithPrompt,
      openGuardrailPrompt,
      reportPipelineError,
      onReRunPipeline,
      applyToolMutations,
      translateSql,
      runSqlTranslationPipeline,
      runCopilotAction,
      runNextStep,
      showWorkflowResult,
      registerChatInputFocus,
      runTool,
      appendMessage,
    ],
  );

  return (
    <CopilotContext.Provider value={value}>
      {children}
      {vectorIndexModal ? (
        <MongoAutoEmbedVectorIndexModal
          open
          database={vectorIndexModal.database}
          collection={vectorIndexModal.collection}
          initialPath={vectorIndexModal.initialPath}
          textFieldPaths={vectorIndexModal.textFieldPaths}
          migrationPlan={plan}
          onClose={() => setVectorIndexModal(null)}
        />
      ) : null}
      {atlasSearchIndexModal ? (
        <MongoAtlasSearchIndexModal
          open
          database={atlasSearchIndexModal.database}
          collection={atlasSearchIndexModal.collection}
          pattern={atlasSearchIndexModal.pattern}
          initialPath={atlasSearchIndexModal.initialPath}
          textFieldPaths={atlasSearchIndexModal.textFieldPaths}
          migrationPlan={plan}
          onClose={() => setAtlasSearchIndexModal(null)}
        />
      ) : null}
    </CopilotContext.Provider>
  );
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
