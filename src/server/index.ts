/**
 * hvyMETL Web API — optional UI backend; CLI remains fully available.
 */

import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteAdapter } from '../adapters/sqlite.js';
import { designFromModel, writeDesignArtifacts } from '../design/designFromModel.js';
import { ALL_PROFILES } from '../profiles/profiles.js';
import { loadKnowledgeBase } from '../rag/chunker.js';
import { createRetrievalConfigFromEnv, retrieve } from '../rag/retrieval.js';
import { buildPromptBundle, buildRetrievalQuery } from '../rag/promptBundle.js';
import { getProfile } from '../profiles/profiles.js';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import type { SqlStructuralModel } from '../types.js';
import { getPipelineConfigStatus } from './pipelineConfig.js';
import { runFullPipeline } from './runPipeline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const KNOWLEDGE_DIR = join(ROOT, 'knowledge');
const UPLOAD_DIR = join(ROOT, 'web-uploads');
const PORT = Number(process.env.HVYMETL_UI_PORT ?? 3847);

mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

/** Supported dialect labels for the import UI (SQLite is live; others use DDL paste). */
const DIALECTS = [
  { id: 'sqlite', label: 'SQLite', live: true },
  { id: 'postgresql', label: 'PostgreSQL', live: false },
  { id: 'mysql', label: 'MySQL', live: false },
  { id: 'mssql', label: 'Microsoft SQL Server', live: false },
  { id: 'clickhouse', label: 'ClickHouse', live: false },
  { id: 'oracle', label: 'Oracle', live: false },
];

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
    })),
  );
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
    res.json({ model, dialect, tableCount: model.tables.length });
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
    res.json({ model, ddl, dialect: 'sqlite', sourcePath: req.file.path });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/** AI-powered design: RAG + pattern selector → migration plan. */
app.post('/api/design', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId ?? 'catalog');
    let model: SqlStructuralModel;
    if (req.body?.ddl) {
      model = parseDdlToModel(String(req.body.ddl), `ddl:${req.body?.dialect ?? 'import'}`);
    } else if (req.body?.model) {
      model = req.body.model as SqlStructuralModel;
    } else {
      res.status(400).json({ error: 'Provide ddl or model in body' });
      return;
    }
    const result = await designFromModel(model, profileId, KNOWLEDGE_DIR);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Export migration artifacts (plan JSON + design report markdown). */
app.post('/api/export/migration', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId ?? 'catalog');
    const model = req.body?.model as SqlStructuralModel | undefined;
    const ddl = req.body?.ddl as string | undefined;
    const resolved = model ?? (ddl ? parseDdlToModel(ddl) : null);
    if (!resolved) {
      res.status(400).json({ error: 'model or ddl required' });
      return;
    }
    const result = await designFromModel(resolved, profileId, KNOWLEDGE_DIR);
    const outDir = join(ROOT, 'out', 'ui-export');
    const paths = writeDesignArtifacts(outDir, result);
    res.json({
      ...result,
      paths,
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
    const profileId = String(req.body?.profileId ?? 'catalog');
    const ddl = String(req.body?.ddl ?? '');
    if (!ddl.trim()) {
      res.status(400).json({ error: 'ddl is required' });
      return;
    }
    const profile = getProfile(profileId);
    const chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
    const config = createRetrievalConfigFromEnv();
    const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), 8, config);
    const prompts = buildPromptBundle({ profile, ddl, retrievedChunks: retrieved });
    res.json({ prompts, retrievalStrategy: config.voyageProvider ? 'hybrid' : config.openaiProvider ? 'vector' : 'bm25' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Schema templates (Laravel, Django, Twitter, hvyMETL examples). */
app.get('/api/templates', (_req, res) => {
  const templatesDir = join(ROOT, 'web', 'public', 'templates');
  const ids = ['laravel', 'django', 'twitter', 'catalog', 'iot', 'cms'];
  const templates = ids.map((id) => {
    const path = join(templatesDir, `${id}.sql`);
    const ddl = readFileSync(path, 'utf8');
    const model = parseDdlToModel(ddl, `template:${id}`);
    return { id, name: id.charAt(0).toUpperCase() + id.slice(1), ddl, model };
  });
  res.json(templates);
});

/** Pipeline config status (non-secret) for the UI. */
app.get('/api/pipeline/config', (_req, res) => {
  res.json(getPipelineConfigStatus());
});

/**
 * Run full pipeline: design → ETL → csvToAtlas import.
 * Body may override MONGODB_URI, CSV_TO_ATLAS_PATH, sourceDbPath when not in .env.
 */
app.post('/api/pipeline/run', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId ?? 'catalog');
    const model = req.body?.model as SqlStructuralModel | undefined;
    const ddl = String(req.body?.ddl ?? '');
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const result = await runFullPipeline({
      profileId,
      model,
      ddl,
      sourceDbPath: req.body?.sourceDbPath as string | undefined,
      targetDb: req.body?.targetDb as string | undefined,
      dryRun: Boolean(req.body?.dryRun),
      workers: req.body?.workers ? Number(req.body.workers) : undefined,
      drop: req.body?.drop !== false,
      mongoUri: req.body?.mongoUri as string | undefined,
      csvToAtlasPath: req.body?.csvToAtlasPath as string | undefined,
      knowledgeDir: KNOWLEDGE_DIR,
      rootDir: ROOT,
    });

    res.json({
      ok: result.ok,
      errors: result.errors,
      paths: result.paths,
      etl: result.etl,
      imports: result.imports,
      retrievalStrategy: result.design.retrievalStrategy,
      migrationPlanJson: result.design.plan,
      designReportMarkdown: result.design.designReport,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Run pipeline with SQLite source uploaded in the same request. */
app.post('/api/pipeline/run-with-source', upload.single('database'), async (req, res) => {
  try {
    const profileId = String(req.body?.profileId ?? 'catalog');
    const model = req.body?.model ? (JSON.parse(String(req.body.model)) as SqlStructuralModel) : undefined;
    const ddl = String(req.body?.ddl ?? '');
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'database file is required when source is not in .env' });
      return;
    }

    const result = await runFullPipeline({
      profileId,
      model,
      ddl,
      sourceDbPath: req.file.path,
      targetDb: req.body?.targetDb as string | undefined,
      dryRun: req.body?.dryRun === 'true' || req.body?.dryRun === true,
      workers: req.body?.workers ? Number(req.body.workers) : undefined,
      drop: req.body?.drop !== 'false',
      mongoUri: req.body?.mongoUri as string | undefined,
      csvToAtlasPath: req.body?.csvToAtlasPath as string | undefined,
      knowledgeDir: KNOWLEDGE_DIR,
      rootDir: ROOT,
    });

    res.json({
      ok: result.ok,
      errors: result.errors,
      paths: result.paths,
      etl: result.etl,
      imports: result.imports,
      sourcePath: req.file.path,
      retrievalStrategy: result.design.retrievalStrategy,
      migrationPlanJson: result.design.plan,
      designReportMarkdown: result.design.designReport,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Serve built UI (production). Vite dev server proxies /api during development. */
const webDist = join(ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(webDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`hvyMETL UI API http://localhost:${PORT}`);
  console.log('CLI remains available: npm run hvymetl -- <command>');
});
