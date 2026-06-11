/**
 * Deterministic `_id` derivation.
 *
 * Every document's `_id` is computed from its SQL primary-key values, so any
 * number of parallel ETL workers and import processes can upsert the same
 * source row and always land on the same MongoDB document. This is what makes
 * concurrent chunk imports idempotent and race-free.
 */

import type { IdDerivation } from '../types.js';

/** Separator used when joining multiple key parts into one _id string. */
export const ID_PART_SEPARATOR = '|';

/**
 * Build the deterministic `_id` string for one source row.
 *
 * @param derivation - The plan's instructions: which columns, which strategy.
 * @param row - The raw SQL row as a column-name-to-value map.
 */
export function deriveId(derivation: IdDerivation, row: Record<string, unknown>): string {
  const parts = derivation.sourceColumns.map((column) => String(row[column] ?? ''));
  return parts.join(ID_PART_SEPARATOR);
}
