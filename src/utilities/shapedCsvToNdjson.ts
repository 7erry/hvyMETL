/**
 * Turn shaped CSV (csvToAtlas header rules) into NDJSON for mongoimport.
 * SQL imports still call csvToAtlas and do not use this file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from './csv.js';

function coerceScalar(cell: string): string | number | boolean | null {
  const trimmed = cell.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return cell;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter((part) => part.length > 0);
  if (parts.length === 0) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!;
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
      continue;
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

/** One shaped CSV row: dotted headers nest, `[]` headers parse as JSON arrays, other cells stay scalars. */
export function shapedCsvRowToDocument(headers: string[], cells: string[]): Record<string, unknown> {
  const document: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const raw = cells[index] ?? '';
    if (header.endsWith('[]')) {
      const key = header.slice(0, -2);
      const trimmed = raw.trim();
      if (!trimmed) {
        setPath(document, key, []);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(trimmed);
        setPath(document, key, Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        setPath(document, key, []);
      }
      return;
    }
    setPath(document, header, coerceScalar(raw));
  });
  return document;
}

/** Convert a shaped CSV string to NDJSON. An empty body produces an empty string. */
export function shapedCsvTextToNdjson(csvText: string): string {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ''));
  const headers = rows[0];
  if (!headers) return '';
  const documents = rows.slice(1).map((cells) => JSON.stringify(shapedCsvRowToDocument(headers, cells)));
  if (documents.length === 0) return '';
  return `${documents.join('\n')}\n`;
}

/** Read a shaped CSV file and write NDJSON beside the import. Returns the NDJSON path. */
export function writeShapedCsvAsNdjson(csvPath: string, ndjsonPath: string): string {
  writeFileSync(ndjsonPath, shapedCsvTextToNdjson(readFileSync(csvPath, 'utf8')));
  return ndjsonPath;
}
