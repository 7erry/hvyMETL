/** Parse mongosh EJSON output into a Key / Value / Type tree. */

export type BsonTypeName =
  | 'Document'
  | 'Array'
  | 'ObjectId'
  | 'Date'
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'Null'
  | 'Binary'
  | 'Unknown';

export type ResultTreeNode = {
  id: string;
  key: string;
  value: string;
  type: BsonTypeName;
  children?: ResultTreeNode[];
};

/** Guess collection name from the script that was run. */
export function collectionNameFromScript(script: string): string {
  const getColl = /getCollection\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(script);
  if (getColl?.[1]) return getColl[1];
  const dotted = /db\.(\w+)\.(?:find|findOne|aggregate|countDocuments|insert|update|delete)/.exec(
    script,
  );
  if (dotted?.[1]) return dotted[1];
  return 'result';
}

/** True when the script looks like a collection read that should open a docs tab. */
export function scriptLooksLikeCollectionQuery(script: string): boolean {
  return /getCollection\s*\(|db\.\w+\.(?:find|findOne|aggregate)\s*\(/.test(script);
}

/** Extract a balanced JSON value starting at `start` (`{` or `[`). */
export function extractBalancedJson(text: string, start: number): string | null {
  const starter = text[start];
  if (starter !== '{' && starter !== '[') return null;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Extract JSON from mongosh stdout (EJSON.stringify), preferring document arrays. */
export function parseShellJsonOutput(stdout: string): unknown | undefined {
  const text = stdout.trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    // continue with balanced extraction — mongosh may prefix warnings
  }

  const values: unknown[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    const slice = extractBalancedJson(text, i);
    if (!slice) continue;
    try {
      values.push(JSON.parse(slice) as unknown);
      i += slice.length - 1;
    } catch {
      // keep scanning
    }
  }
  if (values.length === 0) return undefined;

  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (Array.isArray(value)) return value;
  }
  return values[values.length - 1];
}

export function bsonTypeOf(value: unknown): BsonTypeName {
  if (value === null) return 'Null';
  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.$oid === 'string') return 'ObjectId';
    if (typeof rec.$date === 'string' || typeof rec.$date === 'number' || typeof rec.$date === 'object') {
      return 'Date';
    }
    if (rec.$binary !== undefined) return 'Binary';
    if (rec.$numberInt !== undefined || rec.$numberLong !== undefined || rec.$numberDouble !== undefined) {
      return 'Number';
    }
    return 'Document';
  }
  return 'Unknown';
}

export function formatBsonValue(value: unknown): string {
  const type = bsonTypeOf(value);
  if (type === 'Null') return 'null';
  if (type === 'ObjectId') return String((value as { $oid: string }).$oid);
  if (type === 'Date') {
    const raw = (value as { $date: unknown }).$date;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && '$numberLong' in (raw as object)) {
      return new Date(Number((raw as { $numberLong: string }).$numberLong)).toISOString();
    }
    return String(raw);
  }
  if (type === 'Number' && value && typeof value === 'object') {
    const rec = value as Record<string, string>;
    return rec.$numberInt ?? rec.$numberLong ?? rec.$numberDouble ?? JSON.stringify(value);
  }
  if (type === 'Document' || type === 'Array') {
    const n = type === 'Array' ? (value as unknown[]).length : Object.keys(value as object).length;
    return type === 'Array' ? `Array (${n})` : `{${n}}`;
  }
  return String(value);
}

export function buildResultTree(
  value: unknown,
  key = 'root',
  idPrefix = 'n',
): ResultTreeNode {
  const type = bsonTypeOf(value);
  const id = idPrefix;
  if (type === 'Array') {
    const arr = value as unknown[];
    return {
      id,
      key,
      value: formatBsonValue(value),
      type,
      children: arr.map((item, i) => buildResultTree(item, String(i), `${id}.${i}`)),
    };
  }
  if (type === 'Document') {
    const rec = value as Record<string, unknown>;
    return {
      id,
      key,
      value: formatBsonValue(value),
      type,
      children: Object.entries(rec).map(([k, v], i) =>
        buildResultTree(v, k, `${id}.${i}`),
      ),
    };
  }
  return { id, key, value: formatBsonValue(value), type };
}

/** Documents to show in the tree tab (array of docs, or single doc wrapped). */
export function documentsFromParsedOutput(parsed: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(parsed)) {
    // Empty find() → [] still opens a collection docs tab
    if (parsed.length === 0) return [];
    if (parsed.every((d) => d && typeof d === 'object' && !Array.isArray(d))) {
      return parsed as Record<string, unknown>[];
    }
    return null;
  }
  if (parsed && typeof parsed === 'object') {
    const rec = parsed as Record<string, unknown>;
    // show collections shape
    if (Array.isArray(rec.collections)) return null;
    return [rec];
  }
  return null;
}

/**
 * Recover complete top-level documents from truncated mongosh EJSON
 * (e.g. find() arrays cut at MONGOSH_MAX_OUTPUT_BYTES).
 */
export function salvageDocumentsFromShellOutput(stdout: string): Record<string, unknown>[] {
  const text = stdout.trim();
  if (!text) return [];
  const docs: Record<string, unknown>[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    const slice = extractBalancedJson(text, i);
    if (!slice) continue;
    try {
      const value = JSON.parse(slice) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rec = value as Record<string, unknown>;
        // skip wrapper shapes from show collections / listDatabases
        if (Array.isArray(rec.collections) || Array.isArray(rec.databases)) continue;
        docs.push(rec);
        i += slice.length - 1;
      }
    } catch {
      // keep scanning
    }
  }
  return docs;
}

/** Docs for a result tab: full array parse first; salvage objects when output was truncated mid-array. */
export function resolveShellResultDocuments(
  stdout: string,
  preferCollectionTab: boolean,
): Record<string, unknown>[] | null {
  const parsed = parseShellJsonOutput(stdout);
  const docs = documentsFromParsedOutput(parsed);
  // Complete find() arrays (including []) — use as-is
  if (docs !== null && Array.isArray(parsed)) return docs;
  if (preferCollectionTab) {
    const salvaged = salvageDocumentsFromShellOutput(stdout);
    // Truncated EJSON often parses as the last complete object only; prefer all salvaged docs
    if (salvaged.length > 0) return salvaged;
    return docs ?? [];
  }
  return docs;
}
