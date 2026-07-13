import type { DiagramExport, Dialect, Profile, SqlStructuralModel } from './types';
import type { ProfileRequestFields, WorkloadProfile } from './customProfileShared';

const base = '';

type AccessTokenProvider = () => Promise<string>;

let accessTokenProvider: AccessTokenProvider | undefined;

export function setAccessTokenProvider(provider: AccessTokenProvider | undefined): void {
  accessTokenProvider = provider;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = accessTokenProvider ? await accessTokenProvider() : '';
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export type ProfileInference = {
  profileId: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export async function inferProfile(model: SqlStructuralModel): Promise<ProfileInference> {
  const res = await apiFetch(`${base}/api/profiles/infer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  const data = await res.json();
  return data.inferred;
}

async function readApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await apiFetch(`${base}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export type AuthConfigResponse = {
  authEnabled: boolean;
  rolesClaim: string;
  hostedUrl: string;
  domain?: string;
  clientId?: string;
  audience?: string;
};

export async function fetchAuthConfig(): Promise<AuthConfigResponse> {
  const res = await fetch(`${base}/api/auth/config`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<AuthConfigResponse>;
}

export type AuthSessionResponse = {
  userId: string;
  roles: string[];
};

export async function fetchAuthSession(): Promise<AuthSessionResponse> {
  const res = await apiFetch(`${base}/api/auth/me`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<AuthSessionResponse>;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await apiFetch(`${base}/api/profiles`);
  if (!res.ok) throw new Error(await readApiError(res));
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Profiles API returned invalid data');
  return data;
}

export async function fetchDialects(): Promise<Dialect[]> {
  const res = await apiFetch(`${base}/api/dialects`);
  if (!res.ok) throw new Error(await readApiError(res));
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Dialects API returned invalid data');
  return data;
}

export async function importDdl(
  ddl: string,
  dialect: string,
): Promise<{ model: SqlStructuralModel; ddl: string; inferred?: ProfileInference }> {
  const res = await apiFetch(`${base}/api/schema/import-ddl`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ddl, dialect }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  const data = await res.json();
  return { model: data.model, ddl, inferred: data.inferred };
}

export async function importSqlite(
  file: File,
): Promise<{ model: SqlStructuralModel; ddl: string; sourcePath?: string; inferred?: ProfileInference }> {
  const body = new FormData();
  body.append('database', file);
  const res = await apiFetch(`${base}/api/schema/import-sqlite`, { method: 'POST', body });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export type PipelineConfigStatus = {
  hasMongoUri: boolean;
  hasModelKey: boolean;
  hasCsvToAtlas: boolean;
  csvToAtlasLabel?: string;
  csvToAtlasResolvedPath?: string;
  csvSourcePath?: string;
  hasCsvSource: boolean;
  defaultTargetDb: string;
  schemaDialect?: string;
  schemaDialectLabel?: string;
  csvToAtlasValidation: { ok: boolean; errors: string[]; warnings: string[] };
  missing: string[];
  mongoUriMasked?: string;
  mongodbModelKeyMasked?: string;
  mongoConnectivity?: {
    ok: boolean;
    code?: string;
    message?: string;
    hint?: string;
  };
  serverEgressIp?: string;
  hostedUrl?: string;
  requiresCsvUpload?: boolean;
  serverManagedCsvToAtlas?: boolean;
  tenantSecrets?: TenantSecretsStatus;
  mockCsvGenerator?: {
    ok: boolean;
    python?: string;
    version?: string;
    code?: string;
    message?: string;
    hint?: string;
  };
};

export type TenantSecretsStatus = {
  hasMongoUri: boolean;
  hasMongodbModelKey: boolean;
  mongoUriMasked?: string;
  mongodbModelKeyMasked?: string;
  updatedAt?: string;
};

export type PipelineRunResult = {
  ok: boolean;
  errors: string[];
  paths: {
    outDir: string;
    planPath: string;
    reportPath: string;
    manifestPath: string;
    zipPath?: string;
  };
  runId?: string;
  zipDownloadUrl?: string;
  csvSource: {
    path: string;
    collections: { name: string; files: string[] }[];
  };
  imports: { collection: string; files: string[]; ok: boolean; insertedCount?: number; error?: string }[];
  csvSourcePath?: string;
  retrievalStrategy?: string;
  modelTokenUsage?: import('./modelUsage').ModelTokenUsage;
  migrationPlanJson?: unknown;
  designReportMarkdown?: string;
  apiArtifacts?: ApiArtifactBundleInfo;
};

export type MockCsvOptions = {
  baseRowsPerTable?: number;
  childMultiplier?: number;
  minRows?: number;
  maxRows?: number;
  seed?: number;
};

export type PipelineRunRequest = ProfileRequestFields & {
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  csvSourcePath?: string;
  cardinalityOverrides?: Record<string, number>;
  forceEmbedOverrides?: Record<string, boolean>;
  generateMockCsv?: boolean;
  mockCsvOptions?: MockCsvOptions;
  targetDb?: string;
  drop?: boolean;
  mongoUri?: string;
  mongodbModelKey?: string;
  csvToAtlasPath?: string;
  customProfile?: WorkloadProfile;
};

export type { PipelineProgressEvent, PipelineProgressStage } from './pipelineStages.js';

async function consumePipelineStream(
  response: Response,
  onProgress: (event: import('./pipelineStages.js').PipelineProgressEvent) => void,
): Promise<PipelineRunResult> {
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? response.statusText);
  }
  if (!response.body) {
    throw new Error('Pipeline stream returned no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      const payload = JSON.parse(dataLine.slice(6)) as {
        type: string;
        error?: string;
        stage?: import('./pipelineStages.js').PipelineProgressStage;
        message?: string;
        current?: number;
        total?: number;
        collection?: string;
      } & PipelineRunResult;

      if (payload.type === 'progress' && payload.stage && payload.message) {
        onProgress({
          stage: payload.stage,
          message: payload.message,
          current: payload.current,
          total: payload.total,
          collection: payload.collection,
        });
      } else if (payload.type === 'complete') {
        const { type: _type, ...result } = payload;
        return result as PipelineRunResult;
      } else if (payload.type === 'error') {
        throw new Error(payload.error ?? 'Pipeline failed');
      }
    }
  }

  throw new Error('Pipeline stream ended without a result');
}

export async function runPipeline(
  request: PipelineRunRequest,
  onProgress?: (event: import('./pipelineStages.js').PipelineProgressEvent) => void,
): Promise<PipelineRunResult> {
  const res = await apiFetch(`${base}/api/pipeline/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, stream: Boolean(onProgress) }),
  });

  if (onProgress) {
    return consumePipelineStream(res, onProgress);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function runPipelineWithCsv(
  files: File[],
  request: PipelineRunRequest,
  onProgress?: (event: import('./pipelineStages.js').PipelineProgressEvent) => void,
): Promise<PipelineRunResult> {
  const body = new FormData();
  for (const file of files) body.append('csvs', file);
  body.append('profileId', request.profileId);
  if (request.customProfile) body.append('customProfile', JSON.stringify(request.customProfile));
  if (request.customTelemetry) body.append('customTelemetry', JSON.stringify(request.customTelemetry));
  body.append('model', JSON.stringify(request.model));
  body.append('ddl', request.ddl);
  if (request.dialect) body.append('dialect', request.dialect);
  if (request.targetDb) body.append('targetDb', request.targetDb);
  if (request.drop === false) body.append('drop', 'false');
  if (request.mongoUri) body.append('mongoUri', request.mongoUri);
  if (request.mongodbModelKey) body.append('mongodbModelKey', request.mongodbModelKey);
  if (request.csvToAtlasPath) body.append('csvToAtlasPath', request.csvToAtlasPath);
  if (request.cardinalityOverrides) body.append('cardinalityOverrides', JSON.stringify(request.cardinalityOverrides));
  if (request.forceEmbedOverrides) body.append('forceEmbedOverrides', JSON.stringify(request.forceEmbedOverrides));
  if (request.generateMockCsv) body.append('generateMockCsv', 'true');
  if (request.mockCsvOptions) body.append('mockCsvOptions', JSON.stringify(request.mockCsvOptions));
  if (onProgress) body.append('stream', 'true');

  const res = await apiFetch(`${base}/api/pipeline/run-with-csv`, { method: 'POST', body });

  if (onProgress) {
    return consumePipelineStream(res, onProgress);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function fetchPipelineConfig(options?: {
  schemaDialect?: string;
  csvSourcePath?: string;
  csvToAtlasPath?: string;
  generateMockCsv?: boolean;
  mongoUri?: string;
  mongodbModelKey?: string;
}): Promise<PipelineConfigStatus> {
  const params = new URLSearchParams();
  if (options?.schemaDialect) params.set('schemaDialect', options.schemaDialect);
  if (options?.csvSourcePath) params.set('csvSourcePath', options.csvSourcePath);
  if (options?.csvToAtlasPath) params.set('csvToAtlasPath', options.csvToAtlasPath);
  if (options?.generateMockCsv) params.set('generateMockCsv', 'true');
  if (options?.mongoUri) params.set('mongoUri', options.mongoUri);
  if (options?.mongodbModelKey) params.set('mongodbModelKey', options.mongodbModelKey);
  const query = params.toString();
  const res = await apiFetch(`${base}/api/pipeline/config${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function fetchTenantSecrets(): Promise<TenantSecretsStatus> {
  const res = await apiFetch(`${base}/api/workspace/secrets`);
  if (!res.ok) throw new Error(await readApiError(res));
  const data = (await res.json()) as { secrets: TenantSecretsStatus };
  return data.secrets;
}

export async function saveTenantSecrets(secrets: {
  mongoUri?: string;
  mongodbModelKey?: string;
}): Promise<TenantSecretsStatus> {
  const res = await apiFetch(`${base}/api/workspace/secrets`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(secrets),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const data = (await res.json()) as { secrets: TenantSecretsStatus };
  return data.secrets;
}

export async function downloadPipelineResults(runId: string, filename?: string): Promise<void> {
  const res = await apiFetch(`${base}/api/pipeline/runs/${encodeURIComponent(runId)}/download`);
  if (!res.ok) throw new Error(await readApiError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `hvymetl-pipeline-${runId}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type DesignMeta = {
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
  foldedTables: string[];
  csvEnriched: boolean;
  hasRowStats: boolean;
  csvSourcePath?: string;
};

export type DesignResult = {
  plan: unknown;
  designReport: string;
  retrievalStrategy: string;
  designMeta: DesignMeta;
  transformationSummary: import('./transformationSummaryTypes').TransformationSummary;
  modelTokenUsage?: import('./modelUsage').ModelTokenUsage;
  apiArtifacts?: ApiArtifactBundleInfo | null;
};

export type ApiArtifactBundleInfo = {
  outDir: string;
  label: string;
  registeredAt: string;
  swaggerUiUrl: string;
  combinedOpenApiUrl: string;
  collections: { name: string; schemaUrl: string; openApiUrl: string }[];
};

export async function fetchApiArtifacts(): Promise<ApiArtifactBundleInfo | null> {
  const res = await apiFetch(`${base}/api/artifacts`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function fetchApiArtifactJson(urlPath: string): Promise<unknown> {
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const res = await apiFetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export type PipelineCsvUploadResult = {
  ok: true;
  csvSourcePath: string;
  fileCount: number;
  files: string[];
};

/** Upload CSV exports to the tenant workspace on the server (hosted studio). */
export async function uploadPipelineCsvFiles(files: File[]): Promise<PipelineCsvUploadResult> {
  if (files.length === 0) throw new Error('At least one CSV file is required');
  const body = new FormData();
  for (const file of files) body.append('csvs', file);
  const res = await apiFetch(`${base}/api/pipeline/upload-csv`, { method: 'POST', body });
  const data = (await res.json()) as PipelineCsvUploadResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

/** Open Swagger UI in a new tab using the current Auth0 access token (hosted studio). */
export async function openSwaggerUi(urlPath = '/api/docs'): Promise<void> {
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const token = accessTokenProvider ? await accessTokenProvider() : '';
  if (accessTokenProvider && !token) {
    throw new Error('Authentication required. Sign in again to open Swagger UI.');
  }
  const url = token
    ? `${path}?access_token=${encodeURIComponent(token)}`
    : path;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Popup blocked. Allow popups for this site to open Swagger UI.');
}

export type ExplainDesignRequest = ProfileRequestFields & {
  model: SqlStructuralModel;
  ddl?: string;
  dialect?: string;
  csvSourcePath?: string;
  cardinalityOverrides?: Record<string, number>;
  forceEmbedOverrides?: Record<string, boolean>;
  plan?: unknown;
};

export async function explainDesignTransformation(
  request: ExplainDesignRequest,
): Promise<import('./transformationSummaryTypes').TransformationSummary> {
  const res = await apiFetch(`${base}/api/design/explain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function fetchPipelineExecutions(
  limit = 15,
  mongoUri?: string,
): Promise<import('./transformationSummaryTypes').PipelineExecutionsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (mongoUri) params.set('mongoUri', mongoUri);
  const res = await apiFetch(`${base}/api/pipeline/executions?${params}`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function fetchPipelineExecution(
  executionId: string,
  mongoUri?: string,
): Promise<import('./transformationSummaryTypes').PipelineExecutionDetail> {
  const params = new URLSearchParams();
  if (mongoUri) params.set('mongoUri', mongoUri);
  const query = params.toString();
  const res = await apiFetch(
    `${base}/api/pipeline/executions/${encodeURIComponent(executionId)}${query ? `?${query}` : ''}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data.execution as import('./transformationSummaryTypes').PipelineExecutionDetail;
}

export type DesignRequest = ProfileRequestFields & {
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  csvSourcePath?: string;
  cardinalityOverrides?: Record<string, number>;
  forceEmbedOverrides?: Record<string, boolean>;
};

export async function runDesign(request: DesignRequest): Promise<DesignResult> {
  const res = await apiFetch(`${base}/api/design`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function runDesignWithCsv(files: File[], request: DesignRequest): Promise<DesignResult> {
  const body = new FormData();
  for (const file of files) body.append('csvs', file);
  body.append('profileId', request.profileId);
  if (request.customProfile) body.append('customProfile', JSON.stringify(request.customProfile));
  body.append('model', JSON.stringify(request.model));
  body.append('ddl', request.ddl);
  if (request.dialect) body.append('dialect', request.dialect);
  if (request.cardinalityOverrides) body.append('cardinalityOverrides', JSON.stringify(request.cardinalityOverrides));
  if (request.forceEmbedOverrides) body.append('forceEmbedOverrides', JSON.stringify(request.forceEmbedOverrides));

  const res = await apiFetch(`${base}/api/design/with-csv`, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function exportMigration(
  model: SqlStructuralModel,
  profile: ProfileRequestFields,
  ddl: string,
  options?: {
    csvSourcePath?: string;
    dialect?: string;
    cardinalityOverrides?: Record<string, number>;
    forceEmbedOverrides?: Record<string, boolean>;
  },
) {
  const res = await apiFetch(`${base}/api/export/migration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, ddl, ...profile, ...options }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function exportPrompts(ddl: string, profile: ProfileRequestFields) {
  const res = await apiFetch(`${base}/api/export/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ddl, ...profile }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export type RepogenLanguageOption = {
  id: string;
  label: string;
  driverName: string;
};

export type RepogenGeneratedFile = {
  relativePath: string;
  content: string;
};

export type RepogenGenerateResult = {
  language: string;
  languageLabel: string;
  driverName: string;
  files: RepogenGeneratedFile[];
  collectionCount: number;
};

export async function fetchRepogenLanguages(): Promise<RepogenLanguageOption[]> {
  const res = await apiFetch(`${base}/api/repogen/languages`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function generateRepositories(planJson: string, language: string): Promise<RepogenGenerateResult> {
  const res = await apiFetch(`${base}/api/repogen/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planJson, language }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import type { TenantWorkspace } from './workspaceSync';

export async function fetchWorkspace(): Promise<TenantWorkspace> {
  const res = await apiFetch(`${base}/api/workspace`);
  if (!res.ok) throw new Error(await readApiError(res));
  const data = await res.json();
  return (data.workspace ?? {}) as TenantWorkspace;
}

export async function saveWorkspace(workspace: TenantWorkspace): Promise<TenantWorkspace> {
  const res = await apiFetch(`${base}/api/workspace`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workspace),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const data = await res.json();
  return (data.workspace ?? {}) as TenantWorkspace;
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type { DiagramExport, MongoDiagramExport };
