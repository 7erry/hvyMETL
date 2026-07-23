import type { SqlStructuralModel } from './types';
import type { CardinalityOverrides, ForceEmbedOverrides } from './cardinalityOverrides';
import type { RelationshipConnectionType, RelationshipNotation } from './relationshipDisplay';
import type { CustomProfileInput, WorkloadProfile } from './customProfileShared';
import { DEFAULT_MANAGER_COST_INPUTS, type ManagerCostInputs } from './managerCostEstimate';
import {
  COPILOT_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  COPILOT_WIDTH_MAX,
} from './layoutConstants.js';

const STORAGE_KEY_PREFIX = 'hvymetl-session-v1';

function sessionStorageKey(userId?: string): string {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

function clampPanelWidth(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.round(value)));
}

export type PromptArtifact = {
  fileName: string;
  content: string;
};

export type RepositoryArtifact = {
  language: string;
  languageLabel: string;
  driverName: string;
  files: { relativePath: string; content: string }[];
  generatedAt: string;
};

export type MigrationArtifacts = {
  planJson: string;
  designReportMarkdown: string;
  prompts: PromptArtifact[];
  retrievalStrategy?: string;
  generatedAt: string;
  modelTokenUsage?: import('./modelUsage').ModelTokenUsage;
  designMeta?: {
    sqlTableCount: number;
    collectionCount: number;
    foldedTableCount: number;
    foldedTables: string[];
    csvEnriched: boolean;
    hasRowStats: boolean;
  };
  transformationSummary?: import('./transformationSummaryTypes').TransformationSummary;
  repositories?: RepositoryArtifact;
  pipelineResult?: {
    ok: boolean;
    imports: { collection: string; ok: boolean; insertedCount?: number; error?: string }[];
    outDir: string;
  };
  apiArtifacts?: import('./api').ApiArtifactBundleInfo;
};

export type AppView = 'diagram' | 'migration';

export type SchemaPhase = 'before' | 'after';

/** Developer keeps the full engineering UI; manager shows a simplified executive dashboard. */
export type UiRole = 'developer' | 'manager';

export type ManagerReviewAcceptances = {
  planGeneratedAt: string;
  acceptedCollectionNames: string[];
  rejectedTables?: {
    collectionName: string;
    tableName: string;
    reason: string;
    decidedAt: string;
  }[];
  auditEntries?: {
    id: string;
    action: 'accepted_collection' | 'accepted_all' | 'rejected_table';
    collectionName: string;
    tableName?: string;
    reason?: string;
    decidedAt: string;
  }[];
};

export type SessionState = {
  profileId: string;
  dialect: string;
  ddl: string;
  model: SqlStructuralModel | null;
  positions: Record<string, { x: number; y: number }>;
  collectionPositions: Record<string, { x: number; y: number }>;
  snapToGrid: boolean;
  selectedTable: string | null;
  selectedCollection: string | null;
  schemaPhase: SchemaPhase;
  view: AppView;
  migrationArtifacts: MigrationArtifacts | null;
  sidebarWidth: number;
  copilotWidth: number;
  canvasPanelOpen: boolean;
  csvSourcePath: string | null;
  relationshipConnectionType: RelationshipConnectionType;
  relationshipNotation: RelationshipNotation;
  customProfile: WorkloadProfile | null;
  customTelemetryInput: CustomProfileInput | null;
  uiRole: UiRole;
  managerReviewAcceptances: ManagerReviewAcceptances | null;
  managerCostInputs: ManagerCostInputs;
  cardinalityOverrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
};

export const defaultSessionState = (): SessionState => ({
  profileId: 'catalog',
  dialect: 'postgresql',
  ddl: '',
  model: null,
  positions: {},
  collectionPositions: {},
  snapToGrid: true,
  selectedTable: null,
  selectedCollection: null,
  schemaPhase: 'before',
  view: 'diagram',
  migrationArtifacts: null,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  copilotWidth: COPILOT_WIDTH_DEFAULT,
  canvasPanelOpen: true,
  csvSourcePath: null,
  relationshipConnectionType: 'bezier',
  relationshipNotation: 'cardinality',
  customProfile: null,
  customTelemetryInput: null,
  uiRole: 'developer',
  managerReviewAcceptances: null,
  managerCostInputs: { ...DEFAULT_MANAGER_COST_INPUTS },
  cardinalityOverrides: {},
  forceEmbedOverrides: {},
});

export function loadSessionState(userId?: string): SessionState {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(userId));
    if (!raw) return defaultSessionState();
    const parsed = JSON.parse(raw) as Partial<SessionState> & { sourceDbPath?: string | null };
    const { sourceDbPath: _legacy, ...rest } = parsed;
    return {
      ...defaultSessionState(),
      ...rest,
      csvSourcePath: rest.csvSourcePath ?? _legacy ?? null,
      sidebarWidth: clampPanelWidth(rest.sidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX),
      copilotWidth: clampPanelWidth(rest.copilotWidth, COPILOT_WIDTH_DEFAULT, COPILOT_WIDTH_MAX),
      managerCostInputs: {
        ...DEFAULT_MANAGER_COST_INPUTS,
        ...(rest.managerCostInputs ?? {}),
      },
    };
  } catch {
    return defaultSessionState();
  }
}

export function sessionStorageUserKey(userId?: string): string {
  return sessionStorageKey(userId);
}

export function saveSessionState(state: SessionState, userId?: string): void {
  try {
    sessionStorage.setItem(sessionStorageKey(userId), JSON.stringify(state));
  } catch {
    // Quota exceeded or private browsing — ignore.
  }
}
