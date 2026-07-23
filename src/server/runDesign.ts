/**
 * Shared design path for web UI: CSV enrichment + ML/RAG migration planning
 * (same engine as the full pipeline, without Atlas import).
 */

import { existsSync } from 'node:fs';
import type { DesignFromModelResult } from '../design/designFromModel.js';
import { designFromModelWithMlEngine } from '../ml_engine/pipelinePatch.js';
import { configureMigrationStore, resolveMemoryDbName } from '../ml_engine/migrationStore.js';
import type { MigrationPlan, SqlStructuralModel, WorkloadProfile } from '../types.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { resolveCsvSourcePath } from '../utilities/csvSource.js';
import { explainTransformation, type TransformationSummary } from '../design/explainTransformation.js';
import type { ModelTokenUsage } from '../modelUsage.js';

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
  csvAllowedRoots?: string[];
  cardinalityOverrides?: Record<string, number>;
  forceEmbedOverrides?: Record<string, boolean>;
  dialect?: string;
  env?: NodeJS.ProcessEnv;
};

function configureDesignMigrationStore(env: NodeJS.ProcessEnv): void {
  const mongoUri = env.MONGODB_URI?.trim();
  if (mongoUri) {
    configureMigrationStore({ mongoUri, dbName: resolveMemoryDbName(env) });
  }
}

function relationshipOverrideKey(relationship: SqlStructuralModel['relationships'][number]): string {
  return `${relationship.parentTable}::${relationship.childTable}::${relationship.fkColumn}`;
}

function applyCardinalityOverrides(
  model: SqlStructuralModel,
  overrides?: Record<string, number>,
  forceEmbedOverrides?: Record<string, boolean>,
): SqlStructuralModel {
  if (
    (!overrides || Object.keys(overrides).length === 0) &&
    (!forceEmbedOverrides || Object.keys(forceEmbedOverrides).length === 0)
  ) {
    return model;
  }
  return {
    ...model,
    relationships: model.relationships.map((relationship) => {
      const key = relationshipOverrideKey(relationship);
      const maxChildrenPerParent = overrides?.[key];
      const hasMaxOverride =
        typeof maxChildrenPerParent === 'number' && Number.isFinite(maxChildrenPerParent) && maxChildrenPerParent > 0;
      const forceEmbedOverride = forceEmbedOverrides?.[key];
      const hasForceEmbedOverride = forceEmbedOverride === true || forceEmbedOverride === false;
      if (!hasForceEmbedOverride && !hasMaxOverride) return relationship;
      return {
        ...relationship,
        ...(hasMaxOverride
          ? {
              avgChildrenPerParent: Math.max(1, Math.ceil(maxChildrenPerParent / 2)),
              maxChildrenPerParent,
              isBounded: maxChildrenPerParent <= 5000,
              cardinalitySource: 'developer' as const,
            }
          : {}),
        ...(hasForceEmbedOverride ? { forceEmbed: forceEmbedOverride } : {}),
      };
    }),
  };
}

export type DesignRunResult = DesignFromModelResult & {
  designMeta: DesignMeta;
  transformationSummary: TransformationSummary;
  modelTokenUsage: ModelTokenUsage;
};

function enrichModelForDesign(request: DesignRequest, env: NodeJS.ProcessEnv): {
  modelForDesign: SqlStructuralModel;
  enrichedModel: SqlStructuralModel;
  resolvedCsvRoot?: string;
} {
  const modelForDesign: SqlStructuralModel = request.dialect?.trim()
    ? { ...request.model, source: `ddl:${request.dialect.trim()}` }
    : request.model;

  let enrichedModel = modelForDesign;
  let resolvedCsvRoot: string | undefined;

  if (request.csvSourcePath?.trim()) {
    resolvedCsvRoot = resolveCsvSourcePath(request.csvSourcePath, env, request.csvAllowedRoots);
    if (existsSync(resolvedCsvRoot)) {
      enrichedModel = enrichModelFromCsv(modelForDesign, resolvedCsvRoot);
    }
  }

  enrichedModel = applyCardinalityOverrides(enrichedModel, request.cardinalityOverrides, request.forceEmbedOverrides);

  return { modelForDesign, enrichedModel, resolvedCsvRoot };
}

/** Explain pattern decisions without running the ML design engine. */
export function explainDesignRequest(request: DesignRequest, plan?: MigrationPlan): TransformationSummary {
  const env = request.env ?? process.env;
  const { enrichedModel, resolvedCsvRoot } = enrichModelForDesign(request, env);
  const migrationPlan = plan ?? buildMigrationPlan(enrichedModel, request.profile);
  const designMeta = buildDesignMeta(request.model, enrichedModel, migrationPlan, resolvedCsvRoot);
  return explainTransformation(request.model, enrichedModel, migrationPlan, request.profile, {
    csvEnriched: designMeta.csvEnriched,
  });
}

/** Run ML-enhanced design with optional CSV enrichment for row/cardinality stats. */
export async function runDesignForModel(request: DesignRequest): Promise<DesignRunResult> {
  const env = request.env ?? process.env;
  const { enrichedModel, resolvedCsvRoot } = enrichModelForDesign(request, env);

  configureDesignMigrationStore(env);

  const mlDesign = await designFromModelWithMlEngine(enrichedModel, request.profile, request.knowledgeDir, {
    schedulePostMigrationReflection: false,
    clusterId: env.HVYMETL_ATLAS_CLUSTER_ID?.trim(),
  });

  const designMeta = buildDesignMeta(request.model, enrichedModel, mlDesign.plan, resolvedCsvRoot);
  const transformationSummary = explainTransformation(request.model, enrichedModel, mlDesign.plan, request.profile, {
    csvEnriched: designMeta.csvEnriched,
  });

  return {
    plan: mlDesign.plan,
    designReport: mlDesign.designReport,
    retrievalStrategy: mlDesign.retrievalStrategy,
    designMeta,
    transformationSummary,
    modelTokenUsage: mlDesign.modelTokenUsage,
  };
}
