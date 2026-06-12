/**
 * Run the design engine from an in-memory SqlStructuralModel (DDL import or UI).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadKnowledgeBase } from '../rag/chunker.js';
import { createRetrievalConfigFromEnv, describeRetrievalStrategy, retrieve } from '../rag/retrieval.js';
import { buildRetrievalQuery } from '../rag/promptBundle.js';
import type { MigrationPlan, SqlStructuralModel, WorkloadProfile } from '../types.js';
import { getProfile } from '../profiles/profiles.js';
import { buildMigrationPlan } from './patternSelector.js';

const REPORT_CHUNK_COUNT = 8;

export type DesignFromModelResult = {
  plan: MigrationPlan;
  designReport: string;
  retrievalStrategy: string;
};

function renderDesignReport(
  plan: MigrationPlan,
  profile: WorkloadProfile,
  retrieved: { sourceFile: string; heading: string; text: string; score: number }[],
): string {
  const lines: string[] = [
    '# Migration Design Report',
    '',
    `- Source: \`${plan.source}\``,
    `- Profile: ${profile.label} (${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W)`,
    `- Generated: ${plan.generatedAt}`,
    '',
    '## Collections',
  ];
  for (const collection of plan.collections) {
    lines.push('', `### ${collection.name}`, '');
    for (const decision of collection.patterns) {
      lines.push(`- **${decision.pattern}** on \`${decision.target}\` — ${decision.reason}`);
    }
  }
  lines.push('', '## Retrieved RAG Context', '');
  for (const chunk of retrieved) {
    lines.push(`### [${chunk.sourceFile}] ${chunk.heading} (${chunk.score.toFixed(3)})`, '', chunk.text, '');
  }
  return lines.join('\n');
}

/** Build migration plan + design report from a structural model (no SQL file required). */
export async function designFromModel(
  model: SqlStructuralModel,
  profileOrId: string | WorkloadProfile,
  knowledgeDir: string,
): Promise<DesignFromModelResult> {
  const profile = typeof profileOrId === 'string' ? getProfile(profileOrId) : profileOrId;
  const chunks = loadKnowledgeBase(knowledgeDir);
  const retrievalConfig = createRetrievalConfigFromEnv();
  const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), REPORT_CHUNK_COUNT, retrievalConfig);
  const plan = buildMigrationPlan(model, profile);
  plan.source = model.source;
  const designReport = renderDesignReport(plan, profile, retrieved);
  return { plan, designReport, retrievalStrategy: describeRetrievalStrategy(retrievalConfig) };
}

/** Optionally persist plan artifacts to disk (same as CLI design command). */
export function writeDesignArtifacts(
  outDir: string,
  result: DesignFromModelResult,
): { planPath: string; reportPath: string } {
  mkdirSync(outDir, { recursive: true });
  const planPath = join(outDir, 'migration-plan.json');
  const reportPath = join(outDir, 'design-report.md');
  writeFileSync(planPath, `${JSON.stringify(result.plan, null, 2)}\n`);
  writeFileSync(reportPath, result.designReport);
  return { planPath, reportPath };
}
