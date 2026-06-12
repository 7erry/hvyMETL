import type { DiagramExport, Dialect, Profile, SqlStructuralModel } from './types';
import type { ProfileRequestFields, WorkloadProfile } from './customProfileShared';

export type ProfileInference = {
  profileId: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export async function inferProfile(model: SqlStructuralModel): Promise<ProfileInference> {
  const res = await fetch(`${base}/api/profiles/infer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  const data = await res.json();
  return data.inferred;
}

const base = '';

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${base}/api/profiles`);
  return res.json();
}

export async function fetchDialects(): Promise<Dialect[]> {
  const res = await fetch(`${base}/api/dialects`);
  return res.json();
}

export async function importDdl(
  ddl: string,
  dialect: string,
): Promise<{ model: SqlStructuralModel; ddl: string; inferred?: ProfileInference }> {
  const res = await fetch(`${base}/api/schema/import-ddl`, {
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
  const res = await fetch(`${base}/api/schema/import-sqlite`, { method: 'POST', body });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export type PipelineConfigStatus = {
  hasMongoUri: boolean;
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
};

export type PipelineRunResult = {
  ok: boolean;
  errors: string[];
  paths: { outDir: string; planPath: string; reportPath: string; manifestPath: string };
  csvSource: {
    path: string;
    collections: { name: string; files: string[] }[];
  };
  imports: { collection: string; files: string[]; ok: boolean; insertedCount?: number; error?: string }[];
  csvSourcePath?: string;
  retrievalStrategy?: string;
  migrationPlanJson?: unknown;
  designReportMarkdown?: string;
};

export type PipelineRunRequest = ProfileRequestFields & {
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  csvSourcePath?: string;
  targetDb?: string;
  drop?: boolean;
  mongoUri?: string;
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
  const res = await fetch(`${base}/api/pipeline/run`, {
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
  body.append('model', JSON.stringify(request.model));
  body.append('ddl', request.ddl);
  if (request.dialect) body.append('dialect', request.dialect);
  if (request.targetDb) body.append('targetDb', request.targetDb);
  if (request.drop === false) body.append('drop', 'false');
  if (request.mongoUri) body.append('mongoUri', request.mongoUri);
  if (request.csvToAtlasPath) body.append('csvToAtlasPath', request.csvToAtlasPath);
  if (onProgress) body.append('stream', 'true');

  const res = await fetch(`${base}/api/pipeline/run-with-csv`, { method: 'POST', body });

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
}): Promise<PipelineConfigStatus> {
  const params = new URLSearchParams();
  if (options?.schemaDialect) params.set('schemaDialect', options.schemaDialect);
  if (options?.csvSourcePath) params.set('csvSourcePath', options.csvSourcePath);
  if (options?.csvToAtlasPath) params.set('csvToAtlasPath', options.csvToAtlasPath);
  const query = params.toString();
  const res = await fetch(`${base}/api/pipeline/config${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function runDesign(model: SqlStructuralModel, profileId: string, ddl: string) {
  const res = await fetch(`${base}/api/design`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, profileId, ddl }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function exportMigration(
  model: SqlStructuralModel,
  profile: ProfileRequestFields,
  ddl: string,
) {
  const res = await fetch(`${base}/api/export/migration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, ddl, ...profile }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function exportPrompts(ddl: string, profile: ProfileRequestFields) {
  const res = await fetch(`${base}/api/export/prompts`, {
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
  const res = await fetch(`${base}/api/repogen/languages`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

export async function generateRepositories(planJson: string, language: string): Promise<RepogenGenerateResult> {
  const res = await fetch(`${base}/api/repogen/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planJson, language }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function fetchTemplates(): Promise<{ id: string; name: string; ddl: string; model: SqlStructuralModel }[]> {
  const res = await fetch(`${base}/api/templates`);
  return res.json();
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

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type { DiagramExport };
