/**
 * Shared thresholds for SQL → MongoDB embed vs reference decisions.
 * Used by the pattern selector, adapters, CSV enrichment, and UI explanations.
 */

/** Workload is write-heavy at or above this write percentage. */
export const WRITE_HEAVY_PERCENT = 70;
/** Workload qualifies for full embed, subset, and extended-reference patterns. */
export const READ_HEAVY_PERCENT = 55;
/** Workload still prefers partial embed (subset) over pure references. */
export const EMBED_LEANING_PERCENT = 50;
/** Measured max children per parent treated as safely embeddable. */
export const BOUNDED_CHILDREN_THRESHOLD = 250;
/** Developer Embed Overrides max treated as bounded embed intent (UI/API). */
export const DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN = 5000;
/** Default cap for Subset embedded arrays (generic unbounded children). */
export const SUBSET_LIMIT = 10;

/** Subset cap for address-like children (recent active addresses only). */
export const SUBSET_LIMIT_ADDRESS = 5;

/** Subset cap for loyalty enrollments (typically 1–3 active programs). */
export const SUBSET_LIMIT_LOYALTY = 3;

/** Pick Subset `maxItems` from child table semantics (addresses, loyalty, reviews, default). */
export function subsetLimitForChildTable(tableName: string): number {
  const key = tableName.toLowerCase();
  if (isAddressLikeTableName(key)) return SUBSET_LIMIT_ADDRESS;
  if (isLoyaltyLikeTableName(key)) return SUBSET_LIMIT_LOYALTY;
  if (/review|rating|comment|ticket|order|support/.test(key)) return SUBSET_LIMIT;
  return SUBSET_LIMIT;
}

function isAddressLikeTableName(key: string): boolean {
  return /address/.test(key);
}

function isLoyaltyLikeTableName(key: string): boolean {
  return /loyalty/.test(key);
}
/** Max children per parent for line-item tables without measured stats. */
export const LINE_ITEMS_EMBED_MAX = 250;
