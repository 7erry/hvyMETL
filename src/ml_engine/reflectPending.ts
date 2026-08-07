import { analyzeAndReflect } from './feedbackCollector.js';
import type { MigrationStore } from './migrationStore.js';

export type ReflectPendingResult = {
  processed: number;
  lessonsPersisted: number;
  errors: string[];
};

/**
 * Reflect all migration logs still in `pending_reflection` older than minAgeMs.
 * Used by scheduled studio jobs and operator batch runs.
 */
export async function reflectPendingMigrationLogs(options: {
  store: MigrationStore;
  minAgeMs?: number;
  clusterId?: string;
}): Promise<ReflectPendingResult> {
  const minAgeMs = Math.max(0, options.minAgeMs ?? 0);
  const pending = await options.store.listPendingReflectionLogs({ minAgeMs });
  const errors: string[] = [];
  let lessonsPersisted = 0;

  for (const log of pending) {
    try {
      const result = await analyzeAndReflect(log.migrationId, {
        store: options.store,
        clusterId: options.clusterId ?? log.clusterId,
      });
      if (result.lessonPersisted) lessonsPersisted += 1;
    } catch (error) {
      errors.push(`${log.migrationId}: ${String(error)}`);
    }
  }

  return { processed: pending.length, lessonsPersisted, errors };
}
