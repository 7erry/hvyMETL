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
/** How many child documents the Subset pattern keeps on the parent. */
export const SUBSET_LIMIT = 25;
/** Max children per parent for line-item tables without measured stats. */
export const LINE_ITEMS_EMBED_MAX = 250;
