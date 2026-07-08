/**
 * hvyMETL Web API — optional UI backend; CLI remains fully available.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { loadProjectEnv } from './loadProjectEnv.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
loadProjectEnv(ROOT);
import { createSqliteAdapter } from '../adapters/sqlite.js';
import { DIALECTS } from '../dialects.js';
import { writeDesignArtifacts } from '../design/designFromModel.js';
import { explainDesignRequest, runDesignForModel } from './runDesign.js';
import { ALL_PROFILES, buildCustomProfileFromInput, getProfile } from '../profiles/profiles.js';
import { resolveWorkloadProfile } from '../profiles/resolveProfile.js';
import { inferWorkloadProfile } from '../profiles/inferProfile.js';
import { loadKnowledgeBase } from '../rag/chunker.js';
import { createRetrievalConfigFromEnv, retrieve } from '../rag/retrieval.js';
import { buildPromptBundle, buildRetrievalQuery } from '../rag/promptBundle.js';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { generateMockCsvFromDdl, verifyMockCsvGenerator } from '../utilities/mockCsvFromDdl.js';
import type { MigrationPlan, SqlStructuralModel } from '../types.js';
import { getPipelineConfigStatus } from './pipelineConfig.js';
import { runFullPipeline } from './runPipeline.js';
import { runFullPipelineWithStream } from './pipelineStream.js';
import {
  configureMigrationStore,
  getMigrationStore,
  resolveMemoryDbName,
} from '../ml_engine/migrationStore.js';
import { PIPELINE_EXECUTIONS_COLLECTION } from './pipelineExecutionTypes.js';
import { generateFromPlan } from '../repogen/generate.js';
import { REPOGEN_LANGUAGES } from '../repogen/languages/index.js';
import { registerApiArtifactRoutes } from './apiArtifactRoutes.js';
import { registerApiArtifacts, serializeApiArtifactBundle } from './apiArtifactStore.js';
import { mountWebUi } from './setupWebUi.js';
import type { DesignFromModelResult } from '../design/designFromModel.js';
import {
  formatMongoConnectivityFailure,
  maskMongoUri,
  verifyMongoUri,
} from '../utilities/mongoConnectivity.js';

const KNOWLEDGE_DIR = join(ROOT, 'knowledge');
const UPLOAD_DIR = join(ROOT, 'web-uploads');
const PORT = Number(process.env.HVYMETL_UI_PORT ?? 3847);

mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

registerApiArtifactRoutes(app, ROOT);

function persistDesignApiArtifacts(result: DesignFromModelResult, outDir: string, label: string) {
  const paths = writeDesignArtifacts(outDir, result);
  const registered = registerApiArtifacts(outDir, label);
  return {
    paths,
    apiArtifacts: registered ? serializeApiArtifactBundle(registered) : null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'hvyMETL', cli: 'available' });
});

app.get('/api/dialects', (_req, res) => {
  res.json(DIALECTS);
});

app.get('/api/profiles', (_req, res) => {
  res.json(
    ALL_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      telemetry: p.telemetry,
      preferredPatterns: p.preferredPatterns,
      writeConcern: p.writeConcern,
      readPreference: p.readPreference,
      compression: p.compression,
      pool: p.pool,
    })),
  );
});

/** Build a custom workload profile from user-supplied telemetry and driver tuning. */
app.post('/api/profiles/custom', (req, res) => {
  try {
    const profile = buildCustomProfileFromInput(req.body);
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** Infer workload profile from a structural model (same logic as schema import auto-detect). */
app.post('/api/profiles/infer', (req, res) => {
  const model = req.body?.model as SqlStructuralModel | undefined;
  if (!model?.tables?.length) {
    res.status(400).json({ error: 'model with tables is required' });
    return;
  }
  try {
    const inferred = inferWorkloadProfile(model);
    res.json({ inferred, profile: getProfile(inferred.profileId) });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** Instant schema import from one DDL query / script. */
app.post('/api/schema/import-ddl', (req, res) => {
  const ddl = String(req.body?.ddl ?? '');
  const dialect = String(req.body?.dialect ?? 'postgresql');
  if (!ddl.trim()) {
    res.status(400).json({ error: 'ddl is required' });
    return;
  }
  try {
    const model = parseDdlToModel(ddl, `ddl:${dialect}`);
    const inferred = inferWorkloadProfile(model);
    res.json({ model, dialect, tableCount: model.tables.length, inferred });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** Import schema from uploaded SQLite database. */
app.post('/api/schema/import-sqlite', upload.single('database'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'database file is required' });
    return;
  }
  try {
    const adapter = createSqliteAdapter(req.file.path);
    const model = adapter.introspect();
    const ddl = adapter.dumpDdl();
    adapter.close();
    const inferred = inferWorkloadProfile(model);
    res.json({ model, ddl, dialect: 'sqlite', sourcePath: req.file.path, inferred });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** AI/RAG design preview: CSV enrichment (when available) + ML engine → migration plan. */
app.post('/api/design', async (req, res) => {
  try {
    let model: SqlStructuralModel;
    if (req.body?.ddl) {
      model = parseDdlToModel(String(req.body.ddl), `ddl:${req.body?.dialect ?? 'import'}`);
    } else if (req.body?.model) {
      model = req.body.model as SqlStructuralModel;
    } else {
      res.status(400).json({ error: 'Provide ddl or model in body' });
      return;
    }
    const profile = resolveWorkloadProfile(req.body);
    const result = await runDesignForModel({
      model,
      profile,
      knowledgeDir: KNOWLEDGE_DIR,
      csvSourcePath: req.body?.csvSourcePath as string | undefined,
      cardinalityOverrides: req.body?.cardinalityOverrides as Record<string, number> | undefined,
      forceEmbedOverrides: req.body?.forceEmbedOverrides as Record<string, boolean> | undefined,
      dialect: req.body?.dialect as string | undefined,
    });
    const outDir = join(ROOT, 'out', 'ui-design');
    const { apiArtifacts } = persistDesignApiArtifacts(result, outDir, 'ui-design');
    res.json({ ...result, apiArtifacts });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Design preview with CSV files uploaded for row count / cardinality enrichment. */
app.post('/api/design/with-csv', (req, res) => {
  const batchDir = join(UPLOAD_DIR, `design-csv-${Date.now()}`);
  mkdirSync(batchDir, { recursive: true });
  const csvUpload = multer({
    storage: multer.diskStorage({
      destination: (_uploadReq, _file, cb) => cb(null, batchDir),
      filename: (_uploadReq, file, cb) => cb(null, file.originalname),
    }),
  }).array('csvs', 500);

  csvUpload(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      res.status(400).json({ error: String(uploadError) });
      return;
    }
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: 'At least one CSV file is required' });
        return;
      }
      const model = req.body?.model ? (JSON.parse(String(req.body.model)) as SqlStructuralModel) : undefined;
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }
      const profile = resolveWorkloadProfile({
        profileId: req.body?.profileId,
        customProfile: req.body?.customProfile ? JSON.parse(String(req.body.customProfile)) : undefined,
        customTelemetry: req.body?.customTelemetry ? JSON.parse(String(req.body.customTelemetry)) : undefined,
      });
      const result = await runDesignForModel({
        model,
        profile,
        knowledgeDir: KNOWLEDGE_DIR,
        csvSourcePath: batchDir,
        cardinalityOverrides: req.body?.cardinalityOverrides
          ? JSON.parse(String(req.body.cardinalityOverrides)) as Record<string, number>
          : undefined,
        forceEmbedOverrides: req.body?.forceEmbedOverrides
          ? JSON.parse(String(req.body.forceEmbedOverrides)) as Record<string, boolean>
          : undefined,
        dialect: req.body?.dialect as string | undefined,
      });
      const outDir = join(ROOT, 'out', 'ui-design');
      const { apiArtifacts } = persistDesignApiArtifacts(result, outDir, 'ui-design');
      res.json({ ...result, apiArtifacts });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
});

/** Explain why patterns/embeds were applied for a model + plan (no ML re-run). */
app.post('/api/design/explain', (req, res) => {
  try {
    let model: SqlStructuralModel;
    if (req.body?.ddl) {
      model = parseDdlToModel(String(req.body.ddl), `ddl:${req.body?.dialect ?? 'import'}`);
    } else if (req.body?.model) {
      model = req.body.model as SqlStructuralModel;
    } else {
      res.status(400).json({ error: 'Provide ddl or model in body' });
      return;
    }
    const profile = resolveWorkloadProfile(req.body);
    const plan = req.body?.plan as MigrationPlan | undefined;
    const summary = explainDesignRequest(
      {
        model,
        profile,
        knowledgeDir: KNOWLEDGE_DIR,
        csvSourcePath: req.body?.csvSourcePath as string | undefined,
        cardinalityOverrides: req.body?.cardinalityOverrides as Record<string, number> | undefined,
        forceEmbedOverrides: req.body?.forceEmbedOverrides as Record<string, boolean> | undefined,
        dialect: req.body?.dialect as string | undefined,
      },
      plan,
    );
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Export migration artifacts (plan JSON + design report markdown). */
app.post('/api/export/migration', async (req, res) => {
  try {
    const model = req.body?.model as SqlStructuralModel | undefined;
    const ddl = req.body?.ddl as string | undefined;
    const resolved = model ?? (ddl ? parseDdlToModel(ddl) : null);
    if (!resolved) {
      res.status(400).json({ error: 'model or ddl required' });
      return;
    }
    const profile = resolveWorkloadProfile(req.body);
    const result = await runDesignForModel({
      model: resolved,
      profile,
      knowledgeDir: KNOWLEDGE_DIR,
      csvSourcePath: req.body?.csvSourcePath as string | undefined,
      cardinalityOverrides: req.body?.cardinalityOverrides as Record<string, number> | undefined,
      forceEmbedOverrides: req.body?.forceEmbedOverrides as Record<string, boolean> | undefined,
      dialect: req.body?.dialect as string | undefined,
    });
    const outDir = join(ROOT, 'out', 'ui-export');
    const { paths, apiArtifacts } = persistDesignApiArtifacts(result, outDir, 'ui-export');
    res.json({
      ...result,
      paths,
      apiArtifacts,
      migrationPlanJson: result.plan,
      designReportMarkdown: result.designReport,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Export RAG-grounded prompt bundle for Cursor / LLM migration workflows. */
app.post('/api/export/prompts', async (req, res) => {
  try {
    const profile = resolveWorkloadProfile(req.body);
    const ddl = String(req.body?.ddl ?? '');
    if (!ddl.trim()) {
      res.status(400).json({ error: 'ddl is required' });
      return;
    }
    const chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
    const config = createRetrievalConfigFromEnv();
    const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), 8, config);
    const prompts = buildPromptBundle({ profile, ddl, retrievedChunks: retrieved });
    res.json({ prompts, retrievalStrategy: config.voyageProvider ? 'hybrid' : config.openaiProvider ? 'vector' : 'bm25' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** List MongoDB officially supported client languages for repogen. */
app.get('/api/repogen/languages', (_req, res) => {
  res.json(
    REPOGEN_LANGUAGES.map((language) => ({
      id: language.id,
      label: language.label,
      driverName: language.driverName,
    })),
  );
});

/** Generate typed repository layer source from a migration plan. */
app.post('/api/repogen/generate', (req, res) => {
  try {
    const language = String(req.body?.language ?? 'node');
    const planBody = req.body?.plan as MigrationPlan | undefined;
    const planJson = req.body?.planJson as string | undefined;

    let plan: MigrationPlan | null = planBody ?? null;
    if (!plan && planJson) {
      plan = JSON.parse(planJson) as MigrationPlan;
    }
    if (!plan?.collections?.length) {
      res.status(400).json({ error: 'plan or planJson with collections is required' });
      return;
    }

    const result = generateFromPlan({ plan, language });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** Pipeline config status (non-secret) for the UI. */
app.get('/api/pipeline/config', async (req, res) => {
  try {
    const schemaDialect = String(req.query?.schemaDialect ?? req.query?.dialect ?? '').trim() || undefined;
    const csvSourcePath = String(req.query?.csvSourcePath ?? req.query?.importedSourcePath ?? '').trim() || undefined;
    const csvToAtlasPath = String(req.query?.csvToAtlasPath ?? '').trim() || undefined;
    const generateMockCsv = req.query?.generateMockCsv === 'true' || req.query?.generateMockCsv === '1';
    const mongoUriOverride = String(req.query?.mongoUri ?? '').trim();
    const effectiveMongoUri = mongoUriOverride || process.env.MONGODB_URI?.trim() || '';

    const status = getPipelineConfigStatus(process.env, {
      schemaDialect,
      csvSourcePath,
      csvToAtlasPath,
      generateMockCsv,
    });

    const mongoConnectivity = effectiveMongoUri
      ? await verifyMongoUri(effectiveMongoUri, { timeoutMs: 12_000 })
      : { ok: false as const, code: 'MISSING_URI', message: 'MONGODB_URI is not set.', hint: 'Add MONGODB_URI to .env (see .env.example).' };

    res.json({
      ...status,
      mongoUriMasked: effectiveMongoUri ? maskMongoUri(effectiveMongoUri) : undefined,
      mongoConnectivity,
      mockCsvGenerator: verifyMockCsvGenerator(ROOT),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** List recent pipeline executions stored in MongoDB (newest first). */
app.get('/api/pipeline/executions', async (req, res) => {
  try {
    const mongoUri = String(req.query?.mongoUri ?? process.env.MONGODB_URI ?? '').trim();
    if (!mongoUri) {
      res.status(400).json({ error: 'MONGODB_URI is required to list pipeline executions.' });
      return;
    }
    configureMigrationStore({
      mongoUri,
      dbName: resolveMemoryDbName(process.env),
    });
    const limit = Math.min(Math.max(Number(req.query?.limit ?? 20), 1), 100);
    const store = getMigrationStore();
    const executions = await store.listPipelineExecutions(limit);
    res.json({
      memoryDb: resolveMemoryDbName(process.env),
      collection: PIPELINE_EXECUTIONS_COLLECTION,
      count: executions.length,
      executions,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Fetch one pipeline execution by id (includes migration plan, design report, csv manifest). */
app.get('/api/pipeline/executions/:executionId', async (req, res) => {
  try {
    const mongoUri = String(req.query?.mongoUri ?? process.env.MONGODB_URI ?? '').trim();
    if (!mongoUri) {
      res.status(400).json({ error: 'MONGODB_URI is required to fetch pipeline executions.' });
      return;
    }
    configureMigrationStore({
      mongoUri,
      dbName: resolveMemoryDbName(process.env),
    });
    const store = getMigrationStore();
    const execution = await store.findPipelineExecution(String(req.params.executionId));
    if (!execution) {
      res.status(404).json({ error: 'Pipeline execution not found.' });
      return;
    }
    res.json({ execution });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Shared JSON shape for pipeline run responses. */
function pipelineRunResponse(result: Awaited<ReturnType<typeof runFullPipeline>>) {
  return {
    ok: result.ok,
    errors: result.errors,
    paths: result.paths,
    csvSource: result.csvSource,
    imports: result.imports,
    csvSourcePath: result.csvSource.path,
    retrievalStrategy: result.design.retrievalStrategy,
    modelTokenUsage: result.design.modelTokenUsage,
    migrationPlanJson: result.design.plan,
    designReportMarkdown: result.design.designReport,
    feedback: result.feedback,
    execution: result.execution,
    apiArtifacts: result.apiArtifacts,
  };
}

/**
 * Run full pipeline: design → csvToAtlas import from CSV exports.
 * Body may override MONGODB_URI, CSV_TO_ATLAS_PATH, csvSourcePath when not in .env.
 * Set `stream: true` for Server-Sent Events progress updates.
 */
app.post('/api/pipeline/run', async (req, res) => {
  try {
    const profile = resolveWorkloadProfile(req.body);
    const model = req.body?.model as SqlStructuralModel | undefined;
    const ddl = String(req.body?.ddl ?? '');
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const pipelineRequest = {
      profileId: profile.id,
      profile,
      model,
      ddl,
      dialect: req.body?.dialect as string | undefined,
      csvSourcePath: req.body?.csvSourcePath as string | undefined,
      cardinalityOverrides: req.body?.cardinalityOverrides as Record<string, number> | undefined,
      forceEmbedOverrides: req.body?.forceEmbedOverrides as Record<string, boolean> | undefined,
      generateMockCsv: Boolean(req.body?.generateMockCsv),
      mockCsvOptions: req.body?.mockCsvOptions as import('../utilities/mockCsvFromDdl.js').MockCsvOptions | undefined,
      targetDb: req.body?.targetDb as string | undefined,
      drop: req.body?.drop !== false,
      mongoUri: req.body?.mongoUri as string | undefined,
      csvToAtlasPath: req.body?.csvToAtlasPath as string | undefined,
      knowledgeDir: KNOWLEDGE_DIR,
      rootDir: ROOT,
    };

    if (req.body?.stream === true) {
      await runFullPipelineWithStream(res, pipelineRequest, (result) => ({
        type: 'complete',
        ...pipelineRunResponse(result),
      }));
      return;
    }

    const result = await runFullPipeline(pipelineRequest);
    res.json(pipelineRunResponse(result));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Run pipeline with CSV files uploaded in the same request. */
app.post('/api/pipeline/run-with-csv', (req, res) => {
  const batchDir = join(UPLOAD_DIR, `csv-batch-${Date.now()}`);
  mkdirSync(batchDir, { recursive: true });
  const csvUpload = multer({
    storage: multer.diskStorage({
      destination: (_uploadReq, _file, cb) => cb(null, batchDir),
      filename: (_uploadReq, file, cb) => cb(null, file.originalname),
    }),
  }).array('csvs', 500);

  csvUpload(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      res.status(400).json({ error: String(uploadError) });
      return;
    }
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: 'At least one CSV file is required' });
        return;
      }

      const profile = resolveWorkloadProfile({
        profileId: req.body?.profileId,
        customProfile: req.body?.customProfile ? JSON.parse(String(req.body.customProfile)) : undefined,
        customTelemetry: req.body?.customTelemetry ? JSON.parse(String(req.body.customTelemetry)) : undefined,
      });
      const model = req.body?.model ? (JSON.parse(String(req.body.model)) as SqlStructuralModel) : undefined;
      const ddl = String(req.body?.ddl ?? '');
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }

      const streamProgress = req.body?.stream === 'true' || req.body?.stream === true;

      const pipelineRequest = {
        profileId: profile.id,
        profile,
        model,
        ddl,
        dialect: req.body?.dialect as string | undefined,
        csvSourcePath: batchDir,
        cardinalityOverrides: req.body?.cardinalityOverrides
          ? JSON.parse(String(req.body.cardinalityOverrides)) as Record<string, number>
          : undefined,
        forceEmbedOverrides: req.body?.forceEmbedOverrides
          ? JSON.parse(String(req.body.forceEmbedOverrides)) as Record<string, boolean>
          : undefined,
        generateMockCsv: req.body?.generateMockCsv === 'true' || req.body?.generateMockCsv === true,
        mockCsvOptions: req.body?.mockCsvOptions
          ? (JSON.parse(String(req.body.mockCsvOptions)) as import('../utilities/mockCsvFromDdl.js').MockCsvOptions)
          : undefined,
        targetDb: req.body?.targetDb as string | undefined,
        drop: req.body?.drop !== 'false',
        mongoUri: req.body?.mongoUri as string | undefined,
        csvToAtlasPath: req.body?.csvToAtlasPath as string | undefined,
        knowledgeDir: KNOWLEDGE_DIR,
        rootDir: ROOT,
      };

      if (streamProgress) {
        await runFullPipelineWithStream(res, pipelineRequest, (result) => ({
          type: 'complete',
          ...pipelineRunResponse(result),
        }));
        return;
      }

      const result = await runFullPipeline(pipelineRequest);

      res.json(pipelineRunResponse(result));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
});

/** Generate mock CSV files from DDL without running the full pipeline. */
app.post('/api/mock-csv/generate', (req, res) => {
  try {
    const ddl = String(req.body?.ddl ?? '');
    if (!ddl.trim()) {
      res.status(400).json({ error: 'ddl is required' });
      return;
    }
    const outDir = String(req.body?.outDir ?? join(UPLOAD_DIR, `mock-csv-${Date.now()}`));
    const mockCsvOptions = req.body?.mockCsvOptions as import('../utilities/mockCsvFromDdl.js').MockCsvOptions | undefined;
    const result = generateMockCsvFromDdl(ddl, outDir, ROOT, mockCsvOptions);
    res.json({
      ok: true,
      outputDir: result.outputDir,
      tables: result.tables,
      files: result.tables.map((table) => join(result.outputDir, `${table}.csv`)),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Serve built UI (production) or Vite middleware (dev:ui) — same port as API. */
const devUiMode = process.env.HVYMETL_DEV_PROXY === '1';

async function startServer(): Promise<void> {
  const uiMode = await mountWebUi(app, ROOT, devUiMode);

  const server = app.listen(PORT);

  server.on('listening', () => {
    console.log(`hvyMETL Migration Studio http://localhost:${PORT}`);
    console.log(`Swagger UI http://localhost:${PORT}/api/docs`);
    if (uiMode === 'vite') {
      console.log('UI: Vite dev server (hot reload)');
    } else if (uiMode === 'static') {
      console.log('UI: serving web/dist');
    } else {
      console.log('UI: not built — run npm run dev:ui or npm run start:ui');
    }
    console.log('CLI remains available: npm run hvymetl -- <command>');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Cannot start hvyMETL: port ${PORT} is already in use.\n` +
          'Stop the other process or set HVYMETL_UI_PORT in .env.',
      );
    } else {
      console.error('Failed to start hvyMETL:', error);
    }
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
