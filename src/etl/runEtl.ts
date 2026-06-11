/**
 * The `hvymetl etl` command implementation: the parallel, pattern-aware
 * extraction pipeline.
 *
 * For every collection in the migration plan it:
 *   1. builds the shaped SQL (pattern formatting layer, see shaper.ts),
 *   2. computes non-overlapping chunk ranges over the primary key (or, for
 *      bucketed collections, window-aligned time ranges),
 *   3. fans the chunks out to a pool of up to MAX_PARALLEL_WORKERS worker
 *      threads that stream rows to CSV files,
 *   4. writes an etl-manifest.json describing every produced file and the
 *      csvToAtlas command that imports it.
 *
 * Safe Ingestion Gate: with --dry-run (or DRY_RUN=true in the environment)
 * each collection extracts exactly 3 parallel chunks of at most 1,000
 * records each and prints structural validation logs instead of running at
 * production scale.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createSqliteAdapter } from '../adapters/sqlite.js';
import type { SqlSourceAdapter } from '../adapters/types.js';
import type { CollectionPlan, MigrationPlan } from '../types.js';
import { splitRange, splitTimeRangeAligned, type ChunkRange } from './splitter.js';
import { buildShapedQuery } from './shaper.js';
import type { ExtractResult, ExtractTask } from './worker.js';

/** Hard ceiling on concurrent extraction threads. */
export const MAX_PARALLEL_WORKERS = 8;
/** Rows we aim to put in one chunk at production scale. */
const TARGET_CHUNK_ROWS = 20000;
/** Dry-run gate: exactly this many chunks per collection... */
const DRY_RUN_CHUNKS = 3;
/** ...of at most this many records each. */
const DRY_RUN_LIMIT = 1000;

/** Options for one ETL run. */
export type EtlOptions = {
  /** Path to migration-plan.json produced by `hvymetl design`. */
  planPath: string;
  /** Folder receiving the CSV chunks and the manifest. */
  outDir: string;
  /** True activates the safe ingestion gate. */
  dryRun: boolean;
  /** Worker pool size (clamped to MAX_PARALLEL_WORKERS). */
  workers: number;
};

/** Manifest entry summarizing one collection's extraction. */
type ManifestCollection = {
  name: string;
  files: string[];
  rowCount: number;
  columns: string[];
  importCommand: string;
};

/** Compute the chunk ranges for one collection (PK ranges or time ranges). */
function computeRanges(
  collection: CollectionPlan,
  adapter: SqlSourceAdapter,
  splitColumn: string,
  splitsOnTime: boolean,
  dryRun: boolean,
  workers: number,
): ChunkRange[] {
  if (splitsOnTime && collection.bucket) {
    // Bucket collections split on window-aligned time ranges so no bucket
    // document can be produced by two different workers.
    const epochSql = `SELECT MIN(CAST(strftime('%s', "${splitColumn}") AS INTEGER)) AS min, MAX(CAST(strftime('%s', "${splitColumn}") AS INTEGER)) AS max FROM "${collection.sourceTable}"`;
    let min: number | null = null;
    let max: number | null = null;
    for (const row of adapter.iterate(epochSql)) {
      min = row.min === null ? null : Number(row.min);
      max = row.max === null ? null : Number(row.max);
    }
    if (min === null || max === null) return [];
    const chunkCount = dryRun ? DRY_RUN_CHUNKS : workers;
    const ranges = splitTimeRangeAligned(min, max, chunkCount, collection.bucket.windowMinutes);
    return dryRun ? ranges.slice(0, DRY_RUN_CHUNKS) : ranges;
  }

  const keyRange = adapter.getKeyRange(collection.sourceTable, splitColumn);
  if (!keyRange) return [];

  const table = adapter.introspect().tables.find((candidate) => candidate.name === collection.sourceTable);
  const rowCount = table ? table.rowCount : 0;
  const chunkCount = dryRun
    ? DRY_RUN_CHUNKS
    : Math.max(1, Math.min(workers, Math.ceil(rowCount / TARGET_CHUNK_ROWS)));
  const ranges = splitRange(keyRange.min, keyRange.max, chunkCount);
  return dryRun ? ranges.slice(0, DRY_RUN_CHUNKS) : ranges;
}

/**
 * Run a list of tasks through a pool of persistent worker threads, never
 * exceeding `poolSize` concurrent workers.
 */
async function runWorkerPool(tasks: ExtractTask[], poolSize: number): Promise<ExtractResult[]> {
  if (tasks.length === 0) return [];
  const workerCount = Math.min(poolSize, tasks.length);
  const queue = [...tasks];
  const results: ExtractResult[] = [];

  /** Send one task to a worker and wait for its reply. */
  function dispatch(worker: Worker, task: ExtractTask): Promise<ExtractResult> {
    return new Promise<ExtractResult>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(task);
    });
  }

  /** One pool slot: a persistent worker pulling tasks until the queue drains. */
  async function runWorkerLoop(): Promise<void> {
    const worker = new Worker(new URL('./worker.js', import.meta.url));
    try {
      while (true) {
        const task = queue.shift();
        if (!task) break;
        const result = await dispatch(worker, task);
        results.push(result);
      }
    } finally {
      await worker.terminate();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorkerLoop()));
  return results;
}

/** Run the full ETL for a migration plan. */
export async function runEtl(options: EtlOptions): Promise<void> {
  const plan: MigrationPlan = JSON.parse(readFileSync(options.planPath, 'utf8'));
  const dryRun = options.dryRun || process.env.DRY_RUN === 'true';
  const poolSize = Math.max(1, Math.min(options.workers, MAX_PARALLEL_WORKERS));

  const csvDir = join(options.outDir, 'csv');
  mkdirSync(csvDir, { recursive: true });

  const adapter = createSqliteAdapter(plan.source);
  const model = adapter.introspect();

  console.log(`ETL ${dryRun ? 'DRY RUN (3 chunks x 1,000 records per collection)' : 'production run'}`);
  console.log(`Source: ${plan.source} | Profile: ${plan.profileId} | Workers: ${poolSize}`);

  // Build every task up front so the pool can interleave collections.
  const tasks: ExtractTask[] = [];
  const taskMeta = new Map<string, { collection: string; columns: string[] }>();

  for (const collection of plan.collections) {
    const shaped = buildShapedQuery(collection, model);
    const ranges = computeRanges(collection, adapter, shaped.splitColumn, shaped.splitsOnTime, dryRun, poolSize);
    const sql = dryRun ? `${shaped.sql}\nLIMIT ${DRY_RUN_LIMIT}` : shaped.sql;

    ranges.forEach((range, index) => {
      const outFile = join(csvDir, `${collection.name}.chunk${index}.csv`);
      tasks.push({
        dbPath: plan.source,
        sql,
        params: [range.start, range.end],
        outFile,
        columns: shaped.columns,
        idFields: shaped.idFields,
      });
      taskMeta.set(outFile, { collection: collection.name, columns: shaped.columns });
    });

    console.log(
      `  ${collection.name}: ${ranges.length} chunk(s) split on ${shaped.splitColumn}${shaped.splitsOnTime ? ' (window-aligned time ranges)' : ''}`,
    );
  }
  adapter.close();

  const startedAt = Date.now();
  const results = await runWorkerPool(tasks, poolSize);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  // Aggregate per collection for the manifest and the validation logs.
  const manifestCollections = new Map<string, ManifestCollection>();
  let hadErrors = false;
  for (const result of results) {
    const meta = taskMeta.get(result.outFile);
    if (!meta) continue;
    if (result.kind === 'error') {
      hadErrors = true;
      console.error(`  ERROR ${result.outFile}: ${result.message}`);
      continue;
    }
    const entry = manifestCollections.get(meta.collection) ?? {
      name: meta.collection,
      files: [],
      rowCount: 0,
      columns: ['_id', ...meta.columns],
      importCommand: `npm run import-cli -- out/csv/${meta.collection}.chunk*.csv ${meta.collection}`,
    };
    entry.files.push(result.outFile);
    entry.rowCount += result.rowCount;
    manifestCollections.set(meta.collection, entry);
  }

  console.log('');
  console.log('Structural validation:');
  for (const entry of manifestCollections.values()) {
    console.log(`  ${entry.name}: ${entry.rowCount.toLocaleString('en-US')} rows in ${entry.files.length} file(s)`);
    console.log(`    columns: ${entry.columns.join(', ')}`);
  }

  const manifest = {
    source: plan.source,
    profileId: plan.profileId,
    dryRun,
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Number(elapsedSeconds),
    collections: [...manifestCollections.values()],
  };
  const manifestPath = join(options.outDir, 'etl-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log('');
  console.log(`Extracted ${results.length} chunk(s) in ${elapsedSeconds}s. Manifest: ${manifestPath}`);
  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run (and DRY_RUN unset) for the full extraction.');
  }
  if (hadErrors) process.exitCode = 1;
}
