/**
 * Shared design path for web UI: CSV enrichment + ML/RAG migration planning
 * (same engine as the full pipeline, without Atlas import).
 */

import { existsSync } from 'node:fs';
import type { DesignFromModelResult } from '../design/designFromModel.js';
import { designFromModelWithMlEngine } from '../ml_engine/pipelinePatch.js';
import { configureMigrationStore, resolveMemoryDbName } from '../ml_engine/migrationStore.js';
import type { MigrationPlan, SqlStructuralModel, WorkloadProfile } from '../types.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { resolveCsvSourcePath } from '../utilities/csvSource.js';

/** Summary of SQL → MongoDB transformation for the After diagram. */
export type DesignMeta = {
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
  foldedTables: string[];
  csvEnriched: boolean;
  hasRowStats: boolean;
  csvSourcePath?: string;
};

export function buildDesignMeta(
  originalModel: SqlStructuralModel,
  enrichedModel: SqlStructuralModel,
  plan: MigrationPlan,
  csvSourcePath?: string,
): DesignMeta {
  const sqlTableCount = originalModel.tables.length;
  const collectionCount = plan.collections.length;
  const sourceTables = new Set(plan.collections.map((collection) => collection.sourceTable));
  const foldedTables = originalModel.tables.map((table) => table.name).filter((name) => !sourceTables.has(name));
  const hasRowStats = enrichedModel.tables.some((table) => table.rowCount > 0);
  const csvEnriched =
    Boolean(csvSourcePath) &&
    enrichedModel.tables.some(
      (table, index) => table.rowCount > 0 && (originalModel.tables[index]?.rowCount ?? 0) === 0,
    );

  return {
    sqlTableCount,
    collectionCount,
    foldedTableCount: foldedTables.length,
    foldedTables,
    csvEnriched,
    hasRowStats,
    csvSourcePath,
  };
}

export type DesignRequest = {
  model: SqlStructuralModel;
  profile: WorkloadProfile;
  knowledgeDir: string;
  csvSourcePath?: string;
  dialect?: string;
  env?: NodeJS.ProcessEnv;
};

function configureDesignMigrationStore(env: NodeJS.ProcessEnv): void {
  const mongoUri = env.MONGODB_URI?.trim();
  if (mongoUri) {
    configureMigrationStore({ mongoUri, dbName: resolveMemoryDbName(env) });
  }
}

/** Run ML-enhanced design with optional CSV enrichment for row/cardinality stats. */
export async function runDesignForModel(
  request: DesignRequest,
): Promise<DesignFromModelResult & { designMeta: DesignMeta }> {
  const env = request.env ?? process.env;
  const modelForDesign: SqlStructuralModel = request.dialect?.trim()
    ? { ...request.model, source: `ddl:${request.dialect.trim()}` }
    : request.model;

  let enrichedModel = modelForDesign;
  let resolvedCsvRoot: string | undefined;

  if (request.csvSourcePath?.trim()) {
    resolvedCsvRoot = resolveCsvSourcePath(request.csvSourcePath, env);
    if (existsSync(resolvedCsvRoot)) {
      enrichedModel = enrichModelFromCsv(modelForDesign, resolvedCsvRoot);
    }
  }

  configureDesignMigrationStore(env);

  const mlDesign = await designFromModelWithMlEngine(enrichedModel, request.profile, request.knowledgeDir, {
    schedulePostMigrationReflection: false,
    clusterId: env.HVYMETL_ATLAS_CLUSTER_ID?.trim(),
  });

  const designMeta = buildDesignMeta(request.model, enrichedModel, mlDesign.plan, resolvedCsvRoot);

  return {
    plan: mlDesign.plan,
    designReport: mlDesign.designReport,
    retrievalStrategy: mlDesign.retrievalStrategy,
    designMeta,
  };
}
