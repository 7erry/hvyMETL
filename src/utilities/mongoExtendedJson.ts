/**
 * Canonical and Relaxed Extended JSON, plus NDJSON.
 * Server-only: imports the MongoDB driver. Do not import this from web/src.
 */

import { createReadStream } from 'node:fs';
import {
  BSON,
  Binary,
  Decimal128,
  Double,
  Int32,
  Long,
  ObjectId,
  Timestamp,
  UUID,
} from 'mongodb';

/** Stop updating field types after this many documents. Row count still includes the rest. */
export const MONGO_JSON_INFER_DOC_CAP = 10_000;

export type ExtendedJsonRecord =
  | { ok: true; value: Record<string, unknown>; line: number }
  | { ok: false; error: string; line: number };

/** BSON type name stored on ColumnModel.bsonType. */
export function bsonTypeName(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof ObjectId) return 'objectId';
  if (value instanceof Date) return 'date';
  if (value instanceof Long) return 'long';
  if (value instanceof Decimal128) return 'decimal';
  if (value instanceof Int32) return 'int';
  if (value instanceof Double) return 'double';
  if (value instanceof Timestamp) return 'timestamp';
  if (value instanceof UUID || value instanceof Binary) return 'binData';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/** True for a plain document. BSON scalars are objects but not nested tables. */
export function isExtendedJsonDocument(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return bsonTypeName(value) === 'object';
}

function parseDocumentText(raw: string, line: number): ExtendedJsonRecord {
  try {
    const value = BSON.EJSON.parse(raw, { relaxed: false });
    if (!isExtendedJsonDocument(value)) {
      return { ok: false, error: 'Expected a JSON object', line };
    }
    return { ok: true, value, line };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, line };
  }
}

function lineIsBalancedObject(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return false;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (const char of trimmed) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
  }
  return depth === 0 && trimmed.endsWith('}');
}

/** NDJSON is several records. A pretty-printed object is one JSON value, even when inner `{` lines appear. */
function isNdjson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return false;
  } catch {
    // Not one JSON value. A bad line between documents still counts as NDJSON.
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 && lines.some((line) => line.startsWith('{'));
}

function endOfJsonValue(text: string, start: number): number {
  const opening = text[start];
  if (opening === '"') {
    let index = start + 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === '"') return index + 1;
      index += 1;
    }
    return -1;
  }

  if (opening === '{' || opening === '[') {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{' || char === '[') depth += 1;
      if (char === '}' || char === ']') {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    return -1;
  }

  let index = start;
  while (index < text.length && !/[\s,\]}]/.test(text[index] ?? '')) index += 1;
  return index;
}

type ArrayReader = {
  push(chunk: string): ExtendedJsonRecord[];
  finish(): ExtendedJsonRecord[];
};

/** Walk a JSON array one element at a time. Incomplete trailing text stays buffered. */
function createArrayReader(): ArrayReader {
  let pending = '';
  let line = 1;
  let seenArray = false;

  const drain = (ended: boolean): ExtendedJsonRecord[] => {
    const records: ExtendedJsonRecord[] = [];
    let index = 0;
    while (index < pending.length) {
      const char = pending[index];
      if (char === '\n') {
        line += 1;
        index += 1;
        continue;
      }
      if (char === ' ' || char === '\t' || char === '\r') {
        index += 1;
        continue;
      }
      if (!seenArray) {
        if (char !== '[') {
          records.push({ ok: false, error: 'Expected a JSON array', line });
          pending = '';
          return records;
        }
        seenArray = true;
        index += 1;
        continue;
      }
      if (char === ']') {
        pending = pending.slice(index + 1);
        return records;
      }
      if (char === ',') {
        index += 1;
        continue;
      }

      const end = endOfJsonValue(pending, index);
      if (end < 0) {
        if (ended) {
          records.push({ ok: false, error: 'Unclosed JSON value', line });
          pending = '';
        } else {
          pending = pending.slice(index);
        }
        return records;
      }

      const raw = pending.slice(index, end);
      const startLine = line;
      for (const rawChar of raw) {
        if (rawChar === '\n') line += 1;
      }
      records.push(parseDocumentText(raw, startLine));
      index = end;
    }
    pending = pending.slice(index);
    return records;
  };

  return {
    push(chunk: string): ExtendedJsonRecord[] {
      pending += chunk;
      return drain(false);
    },
    finish(): ExtendedJsonRecord[] {
      return drain(true);
    },
  };
}

function* iterateNdjson(text: string): Generator<ExtendedJsonRecord> {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) continue;
    yield parseDocumentText(line, index + 1);
  }
}

function* iterateArray(text: string): Generator<ExtendedJsonRecord> {
  const reader = createArrayReader();
  yield* reader.push(text);
  yield* reader.finish();
}

/** Yield one document at a time from an array, NDJSON, or a single object. */
export function* iterateExtendedJsonText(text: string): Generator<ExtendedJsonRecord> {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return;
  if (trimmed.startsWith('[')) {
    yield* iterateArray(trimmed);
    return;
  }
  if (isNdjson(text)) {
    yield* iterateNdjson(text);
    return;
  }
  yield parseDocumentText(trimmed, 1);
}

/**
 * Stream a file. NDJSON is read line by line. A JSON array yields each element
 * without parsing the whole file into a second document list.
 */
export async function* iterateExtendedJsonFile(filePath: string): AsyncGenerator<ExtendedJsonRecord> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  let buffered = '';
  let mode: 'unknown' | 'ndjson' | 'array' | 'value' = 'unknown';
  let line = 1;
  const arrayReader = createArrayReader();

  for await (const chunk of stream) {
    buffered += chunk;
    if (mode === 'unknown') {
      const trimmed = buffered.trimStart();
      if (!trimmed) continue;
      if (trimmed.startsWith('[')) mode = 'array';
      else if (lineIsBalancedObject(buffered.split(/\r?\n/).find((row) => row.trim()) ?? '') || !trimmed.startsWith('{')) {
        mode = 'ndjson';
      } else {
        mode = 'value';
      }
    }

    if (mode === 'ndjson') {
      const parts = buffered.split(/\r?\n/);
      buffered = parts.pop() ?? '';
      for (const part of parts) {
        const current = line;
        line += 1;
        if (!part.trim()) continue;
        yield parseDocumentText(part, current);
      }
    } else if (mode === 'array') {
      const records = arrayReader.push(buffered);
      buffered = '';
      for (const record of records) yield record;
    }
  }

  if (mode === 'ndjson') {
    if (buffered.trim()) yield parseDocumentText(buffered, line);
    return;
  }
  if (mode === 'array') {
    if (buffered) {
      for (const record of arrayReader.push(buffered)) yield record;
    }
    for (const record of arrayReader.finish()) yield record;
    return;
  }
  if (buffered.trim()) {
    yield* iterateExtendedJsonText(buffered);
  }
}
