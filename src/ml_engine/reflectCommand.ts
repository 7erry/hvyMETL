/**
 * CLI entry for deferred ML reflection against live or stub Atlas metrics.
 */

import { analyzeAndReflect } from './feedbackCollector.js';
import { bootstrapAtlasMetricsConnector } from './atlasApiMetrics.js';
import { getMigrationStore } from './migrationStore.js';

export type ReflectCommandOptions = {
  migrationId: string;
  clusterId?: string;
};

/** Run blocking reflection for a single migration log (cron / operator use). */
export async function runReflectCommand(options: ReflectCommandOptions): Promise<void> {
  bootstrapAtlasMetricsConnector(process.env);
  const result = await analyzeAndReflect(options.migrationId.trim(), {
    clusterId: options.clusterId?.trim() || undefined,
    store: getMigrationStore(),
  });
  console.log(
    JSON.stringify(
      {
        migrationId: result.migrationId,
        status: result.status,
        lessonPersisted: result.lessonPersisted,
        breachReasons: result.analysis.breachReasons,
      },
      null,
      2,
    ),
  );
  if (result.status === 'reflected' && result.lessonPersisted) {
    console.info('[ml_engine/reflect] Lesson persisted to lessons_learned.');
  }
}
