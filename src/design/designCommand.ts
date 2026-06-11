/**
 * The `hvymetl design` command implementation.
 *
 * Pipeline: introspect the SQL source -> retrieve grounding chunks from the
 * pattern knowledge base -> run the rule-based pattern selector -> write two
 * artifacts into the output folder:
 *
 *   migration-plan.json  - machine-readable plan consumed by the ETL,
 *                          import CLI, and repository generator
 *   design-report.md     - human-readable justification, including the
 *                          retrieved RAG context the decisions are grounded in
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from '../adapters/sqlite.js';
import { loadKnowledgeBase } from '../rag/chunker.js';
import { createRetrievalConfigFromEnv, describeRetrievalStrategy, retrieve } from '../rag/retrieval.js';
import { buildRetrievalQuery } from '../rag/promptBundle.js';
import type { MigrationPlan, ScoredChunk, WorkloadProfile } from '../types.js';
import { buildMigrationPlan } from './patternSelector.js';

/** How many knowledge chunks the design report cites. */
const REPORT_CHUNK_COUNT = 8;

/** Options for one design run. */
export type DesignOptions = {
  /** Path to the source SQLite database. */
  sourcePath: string;
  /** The workload profile selected at runtime. */
  profile: WorkloadProfile;
  /** Folder receiving migration-plan.json and design-report.md. */
  outDir: string;
  /** Folder holding the knowledge-base markdown files. */
  knowledgeDir: string;
};

/** Render the human-readable design report markdown. */
function renderDesignReport(plan: MigrationPlan, profile: WorkloadProfile, retrieved: ScoredChunk[]): string {
  const lines: string[] = [];
  lines.push(`# Migration Design Report`);
  lines.push('');
  lines.push(`- Source: \`${plan.source}\``);
  lines.push(`- Profile: ${profile.label} (${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W, ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM, growth ${profile.telemetry.growthRate})`);
  lines.push(`- Write concern: w: ${JSON.stringify(plan.writeConcern.w)}, journal: ${plan.writeConcern.journal}`);
  lines.push(`- Pool: maxPoolSize ${plan.pool.maxPoolSize}, minPoolSize ${plan.pool.minPoolSize}, socketTimeoutMS ${plan.pool.socketTimeoutMS}`);
  lines.push(`- Generated: ${plan.generatedAt}`);
  lines.push('');

  lines.push('## Collections');
  for (const collection of plan.collections) {
    lines.push('');
    lines.push(`### ${collection.name}`);
    lines.push('');
    lines.push(`Source table: \`${collection.sourceTable}\` (merged: ${collection.mergedTables.map((table) => `\`${table}\``).join(', ')})`);
    lines.push(`Deterministic _id: ${collection.idDerivation.strategy} from [${collection.idDerivation.sourceColumns.join(', ')}]`);
    lines.push('');
    lines.push('Pattern decisions:');
    for (const decision of collection.patterns) {
      lines.push(`- **${decision.pattern}** on \`${decision.target}\` — ${decision.reason} _(grounded in ${decision.knowledgeSource})_`);
    }
    if (collection.indexes.length > 0) {
      lines.push('');
      lines.push('Indexes:');
      for (const index of collection.indexes) {
        lines.push(`- \`${JSON.stringify(index.keys)}\` (${index.options.name}) — ${index.reason}`);
      }
    }
  }

  lines.push('');
  lines.push('## Retrieved RAG Context');
  lines.push('');
  lines.push('The decisions above are grounded in these knowledge-base chunks (highest relevance first):');
  for (const chunk of retrieved) {
    lines.push('');
    lines.push(`### [${chunk.sourceFile}] ${chunk.heading} (relevance ${chunk.score.toFixed(3)})`);
    lines.push('');
    lines.push(chunk.text);
  }
  lines.push('');
  return lines.join('\n');
}

/** Run the full design pipeline and return the generated plan. */
export async function runDesign(options: DesignOptions): Promise<MigrationPlan> {
  const adapter = createSqliteAdapter(options.sourcePath);
  try {
    const model = adapter.introspect();

    const chunks = loadKnowledgeBase(options.knowledgeDir);
    const retrievalConfig = createRetrievalConfigFromEnv();
    const retrievalQuery = buildRetrievalQuery(options.profile);
    const retrieved = await retrieve(chunks, retrievalQuery, REPORT_CHUNK_COUNT, retrievalConfig);

    const plan = buildMigrationPlan(model, options.profile);

    mkdirSync(options.outDir, { recursive: true });
    const planPath = join(options.outDir, 'migration-plan.json');
    const reportPath = join(options.outDir, 'design-report.md');
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    writeFileSync(reportPath, renderDesignReport(plan, options.profile, retrieved));

    console.log(`Introspected ${model.tables.length} tables, ${model.relationships.length} relationships.`);
    console.log(`Retrieval strategy: ${describeRetrievalStrategy(retrievalConfig)}.`);
    console.log(`Planned ${plan.collections.length} collections.`);
    console.log(`Wrote ${planPath}`);
    console.log(`Wrote ${reportPath}`);
    return plan;
  } finally {
    adapter.close();
  }
}
