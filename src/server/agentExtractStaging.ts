import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const AGENT_EXTRACT_MAX_CHUNK_ROWS = 1_000;
export const AGENT_EXTRACT_MAX_FRAME_BYTES = 2 * 1024 * 1024;

export type ExtractTableProgress = {
  name: string;
  columns: string[];
  checkpoint: string | null;
  rowsReceived: number;
  eof: boolean;
};

export type ExtractJobState = {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'cancelled' | 'error';
  stagingDir: string;
  tables: ExtractTableProgress[];
  error: string | null;
  chunkRows: number;
};

type CheckpointLedger = Record<string, string[]>;

function ledgerPath(stagingDir: string): string {
  return join(stagingDir, '.checkpoints.json');
}

function readLedger(stagingDir: string): CheckpointLedger {
  const path = ledgerPath(stagingDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CheckpointLedger;
  } catch {
    return {};
  }
}

function writeLedger(stagingDir: string, ledger: CheckpointLedger): void {
  writeFileSync(ledgerPath(stagingDir), `${JSON.stringify(ledger, null, 2)}\n`);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function createExtractStagingDir(rootDir: string, token: string): string {
  const safe = createHash('sha256').update(token).digest('hex').slice(0, 24);
  const dir = join(rootDir, 'tmp', 'agent-extract', safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function createExtractJob(stagingDir: string, chunkRows = AGENT_EXTRACT_MAX_CHUNK_ROWS): ExtractJobState {
  return {
    id: randomBytes(8).toString('hex'),
    status: 'pending',
    stagingDir,
    tables: [],
    error: null,
    chunkRows: Math.min(Math.max(chunkRows, 1), AGENT_EXTRACT_MAX_CHUNK_ROWS),
  };
}

/** Idempotent append of one chunk. Returns whether the checkpoint was newly applied. */
export function applyExtractChunk(options: {
  job: ExtractJobState;
  table: string;
  checkpoint: string;
  columns: string[];
  rows: unknown[][];
  eof: boolean;
}): { applied: boolean; table: ExtractTableProgress } {
  const { job, table, checkpoint, columns, rows, eof } = options;
  if (job.status === 'cancelled') throw new Error('Extract job was cancelled.');
  if (job.status === 'complete') throw new Error('Extract job is already complete.');

  let progress = job.tables.find((item) => item.name === table);
  if (!progress) {
    progress = { name: table, columns, checkpoint: null, rowsReceived: 0, eof: false };
    job.tables.push(progress);
  }

  const ledger = readLedger(job.stagingDir);
  const applied = ledger[table] ?? [];
  if (applied.includes(checkpoint)) {
    progress.checkpoint = checkpoint;
    if (eof) progress.eof = true;
    job.status = 'running';
    return { applied: false, table: progress };
  }

  const filePath = join(job.stagingDir, `${table}.csv`);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${columns.map(csvCell).join(',')}\n`);
    progress.columns = columns;
  }

  if (rows.length > 0) {
    const body = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    appendFileSync(filePath, `${body}\n`);
    progress.rowsReceived += rows.length;
  }

  applied.push(checkpoint);
  ledger[table] = applied;
  writeLedger(job.stagingDir, ledger);
  progress.checkpoint = checkpoint;
  if (eof) progress.eof = true;
  job.status = 'running';
  return { applied: true, table: progress };
}

export function markExtractComplete(job: ExtractJobState): void {
  if (job.status === 'cancelled') return;
  const allDone = job.tables.length > 0 && job.tables.every((table) => table.eof);
  if (allDone) job.status = 'complete';
}

export function markExtractError(job: ExtractJobState, error: string): void {
  job.status = 'error';
  job.error = error;
}

export function cancelExtractJob(job: ExtractJobState): void {
  job.status = 'cancelled';
}
