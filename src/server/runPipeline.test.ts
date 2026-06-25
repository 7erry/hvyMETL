import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { InMemoryMigrationStore, resetMigrationStoreSingleton, setMigrationStore } from '../ml_engine/migrationStore.js';
import { runFullPipeline } from './runPipeline.js';

vi.mock('../utilities/runImportCli.js', () => ({
  runImportCli: () => ({ ok: true, parsed: { insertedCount: 10 }, status: 0, stdout: '', stderr: '' }),
}));

vi.mock('../utilities/mongoConnectivity.js', () => ({
  verifyMongoUri: async () => ({ ok: true }),
  formatMongoConnectivityFailure: () => 'MongoDB connectivity check failed',
}));

vi.mock('./pipelineConfig.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipelineConfig.js')>();
  return {
    ...actual,
    getPipelineConfigStatus: () => ({
      hasMongoUri: true,
      hasCsvToAtlas: true,
      hasCsvSource: true,
      defaultTargetDb: 'test_db',
      csvToAtlasValidation: { ok: true, errors: [], warnings: [] },
      missing: [],
    }),
  };
});

const ORACLE_ROOT = join(process.cwd(), 'examples', 'oracle');
const ROOT = process.cwd();

/** Poll until async reflection writes lessons (parallel tests must not share an unpinned store). */
async function waitForLessons(
  store: InMemoryMigrationStore,
  minCount = 1,
  timeoutMs = 10_000,
): Promise<Awaited<ReturnType<InMemoryMigrationStore['listLessons']>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lessons = await store.listLessons('lessons_learned');
    if (lessons.length >= minCount) return lessons;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return store.listLessons('lessons_learned');
}

describe('runFullPipeline feedback memory', () => {
  let store: InMemoryMigrationStore;

  beforeEach(() => {
    store = new InMemoryMigrationStore();
    setMigrationStore(store);
    process.env.HVYMETL_ATLAS_STUB_MODE = 'degraded';
  });

  afterEach(() => {
    resetMigrationStoreSingleton();
    delete process.env.HVYMETL_ATLAS_STUB_MODE;
  });

  it('logs migration decisions and schedules reflection after import', async () => {
    const ddl = readFileSync(join(ORACLE_ROOT, 'oracle-all.ddl'), 'utf8');
    const model = parseDdlToModel(ddl, 'ddl:oracle');

    const result = await runFullPipeline({
      profileId: 'catalog',
      model,
      ddl,
      dialect: 'oracle',
      csvSourcePath: ORACLE_ROOT,
      targetDb: 'oracle_ui_test',
      mongoUri: 'mongodb://stub-for-validation',
      csvToAtlasPath: process.env.CSV_TO_ATLAS_PATH,
      knowledgeDir: join(ROOT, 'knowledge'),
      rootDir: ROOT,
      outDir: join(ROOT, 'out', 'ui-pipeline-test'),
      migrationStore: store,
    });

    expect(result.feedback.collectionsLogged).toBeGreaterThan(0);
    expect(result.feedback.migrationLogIds).toHaveLength(result.feedback.collectionsLogged);
    expect(result.feedback.reflectionScheduled).toBe(true);
    expect(result.execution.executionId).toBeTruthy();
    expect(result.execution.collection).toBe('hvymetl_pipeline_executions');

    const stored = await store.findPipelineExecution(result.execution.executionId);
    expect(stored?.migrationPlan.collections.length).toBeGreaterThan(0);
    expect(stored?.designReport).toContain('# Migration Design Report');
    expect(stored?.csvImportManifest.collections.length).toBeGreaterThan(0);
    expect(stored?.imports.length).toBeGreaterThan(0);

    const logs = await Promise.all(
      result.feedback.migrationLogIds.map((id) => store.findLogByMigrationId(id)),
    );
    expect(logs.every((log) => log?.status === 'pending_reflection' || log?.status === 'reflected' || log?.status === 'healthy')).toBe(true);

    const lessons = await waitForLessons(store);
    expect(lessons.length).toBeGreaterThan(0);
  }, 30_000);
});
