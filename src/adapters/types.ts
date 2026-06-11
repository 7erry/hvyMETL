/**
 * The pluggable SQL source adapter interface.
 *
 * The design engine and ETL never talk to a database driver directly; they
 * go through this interface. The toolkit ships a SQLite adapter (zero infra,
 * powers the bundled examples), and a Postgres or MySQL adapter can be added
 * later by implementing the same five functions.
 */

import type { SqlStructuralModel } from '../types.js';

/** A numeric or date range used to split a table into non-overlapping chunks. */
export type KeyRange = {
  /** Smallest key value in the table. */
  min: number;
  /** Largest key value in the table. */
  max: number;
};

/** The contract every SQL source adapter must fulfill. */
export type SqlSourceAdapter = {
  /** Which engine this adapter speaks, e.g. "sqlite". */
  kind: string;
  /** Path or connection string identifying the source. */
  source: string;
  /**
   * Inspect the database catalog and return the full structural model:
   * tables, columns, primary keys, foreign keys, row counts, and
   * relationship cardinality statistics.
   */
  introspect: () => SqlStructuralModel;
  /** Dump the CREATE TABLE statements as a single DDL script. */
  dumpDdl: () => string;
  /**
   * Get the min/max of a numeric primary-key column, used by the ETL to
   * compute non-overlapping range splits. Returns null for empty tables.
   */
  getKeyRange: (table: string, column: string) => KeyRange | null;
  /**
   * Run a read-only SQL query and iterate the rows one at a time without
   * loading the whole result into memory (the O(1) RAM guarantee).
   */
  iterate: (sql: string, params?: unknown[]) => IterableIterator<Record<string, unknown>>;
  /** Release the underlying database handle. */
  close: () => void;
};
