import type { SqlStructuralModel } from './types';
import type { RelationshipConnectionType, RelationshipNotation } from './relationshipDisplay';
import type { CustomProfileInput, WorkloadProfile } from './customProfileShared';
import { DEFAULT_MANAGER_COST_INPUTS, type ManagerCostInputs } from './managerCostEstimate';

const STORAGE_KEY = 'hvymetl-session-v1';

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
  canvasPanelOpen: boolean;
  csvSourcePath: string | null;
  relationshipConnectionType: RelationshipConnectionType;
  relationshipNotation: RelationshipNotation;
  customProfile: WorkloadProfile | null;
  customTelemetryInput: CustomProfileInput | null;
  uiRole: UiRole;
  managerReviewAcceptances: ManagerReviewAcceptances | null;
  managerCostInputs: ManagerCostInputs;
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
  sidebarWidth: 320,
  canvasPanelOpen: true,
  csvSourcePath: null,
  relationshipConnectionType: 'bezier',
  relationshipNotation: 'detailed',
  customProfile: null,
  customTelemetryInput: null,
  uiRole: 'developer',
  managerReviewAcceptances: null,
  managerCostInputs: { ...DEFAULT_MANAGER_COST_INPUTS },
});

export function loadSessionState(): SessionState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSessionState();
    const parsed = JSON.parse(raw) as Partial<SessionState> & { sourceDbPath?: string | null };
    const { sourceDbPath: _legacy, ...rest } = parsed;
    return {
      ...defaultSessionState(),
      ...rest,
      csvSourcePath: rest.csvSourcePath ?? _legacy ?? null,
      managerCostInputs: {
        ...DEFAULT_MANAGER_COST_INPUTS,
        ...(rest.managerCostInputs ?? {}),
      },
    };
  } catch {
    return defaultSessionState();
  }
}

export function saveSessionState(state: SessionState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private browsing — ignore.
  }
}
