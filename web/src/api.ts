import type { DiagramExport, Dialect, Profile, SqlStructuralModel } from './types';
import type { CustomProfileInput, ProfileRequestFields, WorkloadProfile } from './customProfileShared';
import { formatAuthError, toAuthError } from './auth/authErrors';
import type { CopilotChatApiResponse, CopilotLlmMessage, CopilotStatusResponse } from './copilot/types';
import type { CopilotSchemaContextPayload } from './copilot/schemaContext';

import { prepareCsvFilesForUpload } from './csvUploadSplit.js';
import { createPipelineStreamConsumer } from './pipelineStream.js';

const base = '';

type AccessTokenProvider = () => Promise<string>;

let accessTokenProvider: AccessTokenProvider | undefined;
let dbPrefixProvider: (() => string | undefined) | undefined;

export function setAccessTokenProvider(provider: AccessTokenProvider | undefined): void {
  accessTokenProvider = provider;
}

/** Supply the slugified UI display name so server-side MongoDB inspect can match Atlas prefixes. */
export function setDbPrefixProvider(provider: (() => string | undefined) | undefined): void {
  dbPrefixProvider = provider;
}

function slugifyClientDbPrefix(raw: string): string | undefined {
  const normalized = raw.includes('@') ? (raw.split('@')[0] ?? raw) : raw;
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 24);
  return slug || undefined;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessTokenProvider) {
    try {
      const token = await accessTokenProvider();
      if (token) headers.set('authorization', `Bearer ${token}`);
    } catch (error) {
      throw toAuthError(error);
    }
  }
  return fetch(input, { ...init, headers });
}

async function copilotApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const prefix = dbPrefixProvider?.()?.trim();
  const slug = prefix ? slugifyClientDbPrefix(prefix) : undefined;
  if (slug) headers.set('x-hvymetl-db-prefix', slug);
  return apiFetch(input, { ...init, headers });
}

/** User-facing message for failed API calls (including auth token renewal). */
export function describeApiError(error: unknown): string {
  return formatAuthError(error);
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
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (contentType.includes('application/json')) {
    try {
      const data = JSON.parse(body) as { error?: string; hint?: string; message?: string };
      if (typeof data.error === 'string') {
        if (typeof data.hint === 'string' && data.hint.trim()) {
          return `${data.error} ${data.hint}`;
        }
        return data.error;
      }
      if (typeof data.message === 'string' && data.message.trim()) return data.message;
    } catch {
      // fall through
    }
  }
  if (res.status === 413) {
    return (
      'CSV upload exceeds the size limit (HTTP 413). Large files are split into .chunkN.csv parts automatically; ' +
      'if upload still fails, place exports on the machine running the API server and enter that folder path instead.'
    );
  }
  const trimmed = body.trim();
  if (trimmed.startsWith('<') || trimmed.includes('<html')) {
    if (res.status === 401 || res.status === 403) {
      return res.status === 401
        ? 'Authentication required. Sign in again.'
        : 'Forbidden: insufficient permissions for this action.';
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return `API unavailable (HTTP ${res.status}). Start the hvyMETL API server (npm run dev from the repo root).`;
    }
    return `Unexpected HTML response from server (HTTP ${res.status}). Ensure the API server is running and you are signed in on hosted studio.`;
  }
  if (trimmed) {
    return trimmed.split('\n')[0]?.slice(0, 240) || res.statusText || `HTTP ${res.status}`;
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function parseApiJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiError(res));
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (!contentType.includes('application/json')) {
    const trimmed = body.trim();
    if (trimmed.startsWith('<') || trimmed.includes('<html')) {
      throw new Error(
        'API returned HTML instead of JSON. Ensure the hvyMETL API server is running (npm run dev) and sign in again on hosted studio.',
      );
    }
    throw new Error(`Expected JSON from API (HTTP ${res.status}).`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('Invalid JSON in API response.');
  }
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

/** Build a custom workload profile from telemetry and driver tuning (requires auth when enabled). */
export async function buildCustomProfile(input: CustomProfileInput): Promise<WorkloadProfile> {
  const data = await parseApiJsonResponse<{ profile: WorkloadProfile }>(
    await apiFetch(`${base}/api/profiles/custom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return data.profile;
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
  if (!res.ok) throw new Error(await readApiError(res));
  const data = await res.json();
  return { model: data.model, ddl, inferred: data.inferred };
}

export type BuiltinExampleSummary = {
  id: string;
  label: string;
  description: string;
  dialect: string;
  suggestedProfileId?: string;
};

export async function fetchBuiltinExamples(): Promise<{
  examples: BuiltinExampleSummary[];
  examplesDir: string;
  source: 'env' | 'home' | 'repo';
}> {
  const res = await apiFetch(`${base}/api/schema/builtin-examples`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function importBuiltinExample(exampleId: string): Promise<{
  model: SqlStructuralModel;
  ddl: string;
  dialect: string;
  exampleId: string;
  label: string;
  description?: string;
  suggestedProfileId?: string;
  inferred?: ProfileInference;
}> {
  const res = await apiFetch(`${base}/api/schema/import-builtin-example`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exampleId }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
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
  csvToAtlasFromEnv?: boolean;
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
  csvFileNames?: string[];
  csvSchemaWarnings?: string[];
};

export type TenantSecretsStatus = {
  hasMongoUri: boolean;
  hasMongodbModelKey: boolean;
  mongoUriMasked?: string;
  mongodbModelKeyMasked?: string;
  updatedAt?: string;
};

export type AtlasLogsStatus = {
  configured: boolean;
  hasHostName: boolean;
  groupIdMasked?: string;
  serverEgressIp?: string;
  hostNameLooksValid?: boolean;
  hostNameHint?: string;
};

export type AtlasProjectEvent = {
  id?: string;
  created?: string;
  eventTypeName?: string;
  groupId?: string;
  hostname?: string;
};

export type AtlasProjectEventsResult = {
  events: AtlasProjectEvent[];
  totalCount: number;
};

export type AtlasDatabaseLogResult = {
  logName: string;
  hostName: string;
  lineCount: number;
  lines: string[];
  truncated: boolean;
};

export type AtlasLogFetchWarning = {
  error: string;
  hint?: string;
  code?: string;
};

export type AtlasLogsSnapshot = {
  status: AtlasLogsStatus;
  events: AtlasProjectEventsResult;
  databaseLogs?: AtlasDatabaseLogResult;
  databaseLogWarning?: AtlasLogFetchWarning;
};

export async function fetchAtlasLogsStatus(): Promise<AtlasLogsStatus> {
  const res = await apiFetch(`${base}/api/atlas/logs/status`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function fetchAtlasLogsSnapshot(options?: {
  itemsPerPage?: number;
  maxLogLines?: number;
  includeDatabaseLogs?: boolean;
  logName?: string;
}): Promise<AtlasLogsSnapshot> {
  const params = new URLSearchParams();
  if (options?.itemsPerPage) params.set('itemsPerPage', String(options.itemsPerPage));
  if (options?.maxLogLines) params.set('maxLogLines', String(options.maxLogLines));
  if (options?.includeDatabaseLogs === false) params.set('includeDatabaseLogs', 'false');
  if (options?.logName) params.set('logName', options.logName);
  const query = params.toString();
  const res = await apiFetch(`${base}/api/atlas/logs/snapshot${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

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
  targetDb?: string;
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
    throw new Error(await readApiError(response));
  }
  if (!response.body) {
    throw new Error('Pipeline stream returned no body');
  }

  const reader = response.body.getReader();
  const consumer = createPipelineStreamConsumer(onProgress);

  while (true) {
    const { done, value } = await reader.read();
    const result = consumer.pushChunk(value, done);
    if (result) {
      return result as PipelineRunResult;
    }
    if (done) break;
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

  return parseApiJsonResponse<PipelineRunResult>(res);
}

export async function runPipelineWithCsv(
  files: File[],
  request: PipelineRunRequest,
  onProgress?: (event: import('./pipelineStages.js').PipelineProgressEvent) => void,
): Promise<PipelineRunResult> {
  const uploaded = await uploadPipelineCsvFiles(files);
  return runPipeline({ ...request, csvSourcePath: uploaded.csvSourcePath }, onProgress);
}

export async function fetchPipelineConfig(options?: {
  schemaDialect?: string;
  csvSourcePath?: string;
  csvToAtlasPath?: string;
  generateMockCsv?: boolean;
  mongoUri?: string;
  mongodbModelKey?: string;
  expectedTables?: string[];
}): Promise<PipelineConfigStatus> {
  const params = new URLSearchParams();
  if (options?.schemaDialect) params.set('schemaDialect', options.schemaDialect);
  if (options?.csvSourcePath) params.set('csvSourcePath', options.csvSourcePath);
  if (options?.csvToAtlasPath) params.set('csvToAtlasPath', options.csvToAtlasPath);
  if (options?.generateMockCsv) params.set('generateMockCsv', 'true');
  if (options?.mongoUri) params.set('mongoUri', options.mongoUri);
  if (options?.mongodbModelKey) params.set('mongodbModelKey', options.mongodbModelKey);
  if (options?.expectedTables?.length) params.set('expectedTables', options.expectedTables.join(','));
  const query = params.toString();
  const res = await apiFetch(`${base}/api/pipeline/config${query ? `?${query}` : ''}`);
  return parseApiJsonResponse<PipelineConfigStatus>(res);
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

/** Upload one CSV (or a small batch) to an existing or new tenant batch directory. */
async function uploadPipelineCsvBatch(
  files: File[],
  existingCsvSourcePath?: string,
): Promise<PipelineCsvUploadResult> {
  const body = new FormData();
  for (const file of files) body.append('csvs', file);
  const params = new URLSearchParams();
  if (existingCsvSourcePath) params.set('csvSourcePath', existingCsvSourcePath);
  const query = params.toString();
  const res = await apiFetch(`${base}/api/pipeline/upload-csv${query ? `?${query}` : ''}`, {
    method: 'POST',
    body,
  });
  return parseApiJsonResponse<PipelineCsvUploadResult>(res);
}

/** Upload CSV exports to the tenant workspace on the server (hosted studio). */
export async function uploadPipelineCsvFiles(files: File[]): Promise<PipelineCsvUploadResult> {
  if (files.length === 0) throw new Error('At least one CSV file is required');

  const prepared = await prepareCsvFilesForUpload(files);
  let result: PipelineCsvUploadResult | undefined;
  for (const file of prepared) {
    result = await uploadPipelineCsvBatch([file], result?.csvSourcePath);
  }
  return result!;
}

/** Open Swagger UI in a new tab after priming a short-lived auth cookie on the server. */
export async function openSwaggerUi(urlPath = '/api/docs'): Promise<void> {
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  if (accessTokenProvider) {
    const token = await accessTokenProvider();
    if (!token) {
      throw new Error('Authentication required. Sign in again to open Swagger UI.');
    }
    const bootstrap = await apiFetch(`${base}/api/docs/bootstrap`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!bootstrap.ok) {
      const payload = (await bootstrap.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? bootstrap.statusText ?? 'Failed to open Swagger UI.');
    }
  }
  const popup = window.open(path, '_blank', 'noopener,noreferrer');
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

export async function fetchCopilotStatus(): Promise<CopilotStatusResponse> {
  const res = await copilotApiFetch(`${base}/api/copilot/status`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function invokeCopilotMongoInspect(
  tool: import('./copilot/types').MongoInspectToolName,
  args: Record<string, unknown>,
  planContext?: import('./copilot/mongoPlanContextPayload').MongoPlanContextPayload,
): Promise<import('./copilot/types').MongoInspectInvokeResponse> {
  const res = await copilotApiFetch(`${base}/api/copilot/mongo/inspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, args, ...(planContext ? { planContext } : {}) }),
  });
  const contentType = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (!contentType.includes('application/json')) {
    throw new Error(await readApiError(new Response(body, { status: res.status, headers: res.headers })));
  }
  let data: import('./copilot/types').MongoInspectInvokeResponse & { error?: string };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    throw new Error('Invalid JSON in API response.');
  }
  if (!res.ok && !data.summary) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export async function sendCopilotChat(request: {
  messages: CopilotLlmMessage[];
  schemaContext: CopilotSchemaContextPayload;
  toolsEnabled?: boolean;
}): Promise<CopilotChatApiResponse> {
  const res = await copilotApiFetch(`${base}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export type { DiagramExport, MongoDiagramExport };
