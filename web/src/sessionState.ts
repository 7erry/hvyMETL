import type { SqlStructuralModel } from './types';

const STORAGE_KEY = 'hvymetl-session-v1';

export type PromptArtifact = {
  fileName: string;
  content: string;
};

export type MigrationArtifacts = {
  planJson: string;
  designReportMarkdown: string;
  prompts: PromptArtifact[];
  retrievalStrategy?: string;
  generatedAt: string;
  pipelineResult?: {
    ok: boolean;
    imports: { collection: string; ok: boolean; insertedCount?: number; error?: string }[];
    outDir: string;
  };
};

export type AppView = 'diagram' | 'migration';

export type SessionState = {
  profileId: string;
  dialect: string;
  ddl: string;
  model: SqlStructuralModel | null;
  positions: Record<string, { x: number; y: number }>;
  snapToGrid: boolean;
  selectedTable: string | null;
  view: AppView;
  migrationArtifacts: MigrationArtifacts | null;
  selectedTemplateId: string;
  sidebarWidth: number;
  canvasPanelOpen: boolean;
  sourceDbPath: string | null;
};

export const defaultSessionState = (): SessionState => ({
  profileId: 'catalog',
  dialect: 'postgresql',
  ddl: '',
  model: null,
  positions: {},
  snapToGrid: true,
  selectedTable: null,
  view: 'diagram',
  migrationArtifacts: null,
  selectedTemplateId: '',
  sidebarWidth: 320,
  canvasPanelOpen: true,
  sourceDbPath: null,
});

export function loadSessionState(): SessionState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSessionState();
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return { ...defaultSessionState(), ...parsed };
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
