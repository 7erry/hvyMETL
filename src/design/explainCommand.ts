/**
 * Explain pattern decisions from a structural model (CLI and API).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from '../adapters/sqlite.js';
import type { MigrationPlan, SqlStructuralModel, WorkloadProfile } from '../types.js';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { resolveCsvSourcePath } from '../utilities/csvSource.js';
import { buildMigrationPlan } from './patternSelector.js';
import { explainTransformation, type TransformationSummary } from './explainTransformation.js';

export type ExplainOptions = {
  profile: WorkloadProfile;
  /** SQLite database path. */
  sourcePath?: string;
  /** Raw DDL string. */
  ddl?: string;
  /** Path to a .sql / .ddl file. */
  ddlPath?: string;
  dialect?: string;
  /** Existing migration-plan.json — skips replanning when set with model. */
  planPath?: string;
  /** CSV export directory for cardinality enrichment. */
  csvSourcePath?: string;
  /** Write transformation-summary.md when set. */
  outDir?: string;
};

function loadPlan(path: string): MigrationPlan {
  return JSON.parse(readFileSync(path, 'utf8')) as MigrationPlan;
}

function loadModelFromOptions(options: ExplainOptions): SqlStructuralModel {
  if (options.sourcePath) {
    const adapter = createSqliteAdapter(options.sourcePath);
    try {
      return adapter.introspect();
    } finally {
      adapter.close();
    }
  }
  const ddlText = options.ddl ?? (options.ddlPath ? readFileSync(options.ddlPath, 'utf8') : undefined);
  if (!ddlText) {
    throw new Error('Provide --source, --ddl, or --ddl-file.');
  }
  const dialect = options.dialect?.trim() || 'import';
  return parseDdlToModel(ddlText, `ddl:${dialect}`);
}

/** Build or load a plan, then return a transformation summary. */
export function runExplain(options: ExplainOptions): TransformationSummary {
  const originalModel = loadModelFromOptions(options);
  let enrichedModel = originalModel;

  if (options.csvSourcePath?.trim()) {
    const csvRoot = resolveCsvSourcePath(options.csvSourcePath);
    enrichedModel = enrichModelFromCsv(originalModel, csvRoot);
  }

  const plan = options.planPath ? loadPlan(options.planPath) : buildMigrationPlan(enrichedModel, options.profile);
  const csvEnriched =
    Boolean(options.csvSourcePath?.trim()) &&
    enrichedModel.tables.some(
      (table, index) => table.rowCount > 0 && (originalModel.tables[index]?.rowCount ?? 0) === 0,
    );

  const summary = explainTransformation(originalModel, enrichedModel, plan, options.profile, { csvEnriched });

  if (options.outDir) {
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(join(options.outDir, 'transformation-summary.md'), summary.markdown);
  }

  return summary;
}
