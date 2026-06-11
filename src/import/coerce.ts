/**
 * CSV-to-document shaping rules (the csvToAtlas modeling contract):
 *
 *   - Dotted headers create nested objects: "address.city" -> { address: { city } }
 *   - Numeric path segments create arrays: "items.0.sku" -> items[0].sku
 *   - Headers ending in "[]" parse the cell as one JSON value at that path
 *   - Empty cells become null
 *   - Values that look like numbers, booleans, or JSON are coerced automatically
 *   - The "_id" column is always kept as a string (deterministic upsert key)
 */

/** A document under construction: plain JSON-compatible values. */
export type CsvDocument = Record<string, unknown>;

/** Matches integer and decimal numbers (no leading-zero false positives). */
const NUMBER_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Coerce one raw CSV cell into a typed value.
 * Order matters: null first, then booleans, numbers, JSON, finally string.
 */
export function coerceValue(raw: string): unknown {
  if (raw === '') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (NUMBER_PATTERN.test(raw)) {
    const parsed = Number(raw);
    // Very long digit strings (ids, card numbers) lose precision as numbers;
    // keep them as strings beyond the safe-integer range.
    if (Number.isSafeInteger(parsed) || raw.includes('.')) return parsed;
    return raw;
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // not actually JSON; keep the literal text
    }
  }
  return raw;
}

/**
 * Set a value at a dotted path inside a document, creating intermediate
 * objects (or arrays, when the next segment is numeric) along the way.
 */
export function setPath(target: CsvDocument, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> | unknown[] = target;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextIsIndex = /^\d+$/.test(segments[i + 1]);
    const key: string | number = /^\d+$/.test(segment) ? Number(segment) : segment;

    const container = cursor as Record<string | number, unknown>;
    if (container[key] === undefined || container[key] === null) {
      container[key] = nextIsIndex ? [] : {};
    }
    cursor = container[key] as Record<string, unknown> | unknown[];
  }

  const lastSegment = segments[segments.length - 1];
  const lastKey: string | number = /^\d+$/.test(lastSegment) ? Number(lastSegment) : lastSegment;
  (cursor as Record<string | number, unknown>)[lastKey] = value;
}

/**
 * Convert one CSV row (parallel arrays of headers and cells) into a nested,
 * type-coerced document following the modeling rules above.
 */
export function rowToDocument(headers: string[], cells: string[]): CsvDocument {
  const document: CsvDocument = {};
  headers.forEach((header, index) => {
    const raw = cells[index] ?? '';

    if (header === '_id') {
      // Deterministic upsert keys must survive exactly as written.
      document._id = raw === '' ? null : raw;
      return;
    }

    if (header.endsWith('[]')) {
      // "field[]" cells hold one JSON value (usually an array).
      const path = header.slice(0, -2);
      if (raw === '') {
        setPath(document, path, []);
        return;
      }
      try {
        setPath(document, path, JSON.parse(raw));
      } catch {
        setPath(document, path, raw);
      }
      return;
    }

    setPath(document, header, coerceValue(raw));
  });
  return document;
}
