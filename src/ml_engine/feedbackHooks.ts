/**
 * Hooks for wiring the feedback loop into ETL / web pipeline completion.
 */

import { scheduleReflection } from './feedbackCollector.js';
import type { MigrationStore } from './migrationStore.js';

/**
 * Trigger async post-migration reflection for one or more logged migration IDs.
 * Call this after csvToAtlas import completes (cron-safe, non-blocking).
 */
export function triggerPostMigrationReflection(
  migrationIds: string[],
  options: { clusterId?: string; store?: MigrationStore } = {},
): void {
  for (const migrationId of migrationIds) {
    scheduleReflection(migrationId, { clusterId: options.clusterId, store: options.store });
  }
}
