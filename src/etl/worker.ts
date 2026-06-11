/**
 * ETL worker thread.
 *
 * Each worker owns its own SQLite connection (database handles must never be
 * shared across threads) and processes one extraction task at a time:
 * run the shaped SQL for one chunk range, derive the deterministic _id for
 * every row, and stream the rows to a CSV file on disk.
 *
 * Memory stays O(1): rows come off a lazy database cursor one at a time and
 * go straight into a write stream, honoring backpressure via 'drain'.
 */

import Database from 'better-sqlite3';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { parentPort } from 'node:worker_threads';
import { formatCsvRow } from '../utilities/csv.js';
import { ID_PART_SEPARATOR } from '../utilities/ids.js';

/** One unit of work: extract one chunk of one collection to one CSV file. */
export type ExtractTask = {
  /** Path to the source SQLite database file. */
  dbPath: string;
  /** The shaped SELECT with two positional placeholders (range start/end). */
  sql: string;
  /** Range parameters: [start, end). */
  params: number[];
  /** Output CSV file path for this chunk. */
  outFile: string;
  /** Output column names, in SELECT order, that become CSV columns. */
  columns: string[];
  /** Row keys joined with "|" to form the deterministic _id. */
  idFields: string[];
};

/** Worker reply once a task finishes. */
export type ExtractResult = {
  kind: 'done' | 'error';
  outFile: string;
  rowCount: number;
  message?: string;
};

/** Process one extraction task end to end. */
async function runTask(task: ExtractTask): Promise<ExtractResult> {
  const db = new Database(task.dbPath, { readonly: true, fileMustExist: true });
  const stream = createWriteStream(task.outFile, { encoding: 'utf8' });
  let rowCount = 0;

  try {
    // Header row: deterministic _id first, then the shaped columns.
    stream.write(`${formatCsvRow(['_id', ...task.columns])}\n`);

    for (const rawRow of db.prepare(task.sql).iterate(...task.params)) {
      const row = rawRow as Record<string, unknown>;
      const id = task.idFields.map((field) => String(row[field] ?? '')).join(ID_PART_SEPARATOR);
      const line = `${formatCsvRow([id, ...task.columns.map((column) => row[column])])}\n`;
      // Respect backpressure: when the OS buffer is full, pause the cursor
      // until the stream drains. This is the O(1) RAM guarantee.
      if (!stream.write(line)) await once(stream, 'drain');
      rowCount += 1;
    }

    stream.end();
    await once(stream, 'finish');
    return { kind: 'done', outFile: task.outFile, rowCount };
  } catch (error) {
    stream.destroy();
    return { kind: 'error', outFile: task.outFile, rowCount, message: String(error) };
  } finally {
    db.close();
  }
}

// Workers are persistent: they sit in a pool and handle one task message at
// a time until the orchestrator terminates them.
if (parentPort) {
  parentPort.on('message', (task: ExtractTask) => {
    void runTask(task).then((result) => parentPort?.postMessage(result));
  });
}
