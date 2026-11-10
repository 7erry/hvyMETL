import { compileMatchNode } from '../aggregation/compilePipeline';
import type { FindQueryState, ProjectionRow, SortRow } from './types';

export const FIND_RESULT_LIMIT = 200;

export type CompiledFind = {
  filter: Record<string, unknown>;
  projection: Record<string, number> | null;
  sort: Record<string, 1 | -1> | null;
  skip: number;
  limit: number;
};

export type CompileFindResult =
  | { ok: true; compiled: CompiledFind }
  | { ok: false; error: string };

function compileProjection(rows: ProjectionRow[], enabled: boolean): Record<string, number> | null {
  if (!enabled) return null;
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!row.enabled) continue;
    const field = row.field.trim();
    if (!field) continue;
    out[field] = row.include ? 1 : 0;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function compileSort(rows: SortRow[]): Record<string, 1 | -1> | null {
  const out: Record<string, 1 | -1> = {};
  for (const row of rows) {
    if (!row.enabled) continue;
    const field = row.field.trim();
    if (!field) continue;
    out[field] = row.direction;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function compileFromForm(state: FindQueryState): CompiledFind {
  return {
    filter: compileMatchNode(state.filter),
    projection: compileProjection(state.projection, state.projectionEnabled),
    sort: compileSort(state.sort),
    skip: Math.max(0, Math.floor(state.skip) || 0),
    limit: Math.max(1, Math.floor(state.limit) || FIND_RESULT_LIMIT),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function compileFromJson(jsonText: string): CompiledFind {
  const parsed = JSON.parse(jsonText.trim() || '{}') as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('JSON must be an object with filter / projection / sort / skip / limit');
  }
  const body = parsed as Record<string, unknown>;
  const filter = asRecord(body.filter ?? body.query ?? {}, 'filter');
  let projection: Record<string, number> | null = null;
  if (body.projection != null && typeof body.projection === 'object' && !Array.isArray(body.projection)) {
    projection = body.projection as Record<string, number>;
  }
  let sort: Record<string, 1 | -1> | null = null;
  if (body.sort != null && typeof body.sort === 'object' && !Array.isArray(body.sort)) {
    sort = body.sort as Record<string, 1 | -1>;
  }
  const skip = Math.max(0, Math.floor(Number(body.skip) || 0));
  const limit = Math.max(1, Math.floor(Number(body.limit) || FIND_RESULT_LIMIT));
  return { filter, projection, sort, skip, limit };
}

export function compileFindQuery(state: FindQueryState): CompileFindResult {
  try {
    const compiled =
      state.editMode === 'json' ? compileFromJson(state.jsonText) : compileFromForm(state);
    return { ok: true, compiled };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatFindAsShell(collection: string, compiled: CompiledFind): string {
  const coll = collection.trim() || 'collection';
  const parts: string[] = [
    `db.getCollection(${JSON.stringify(coll)}).find(`,
    `  ${JSON.stringify(compiled.filter, null, 2).replace(/\n/g, '\n  ')}`,
  ];
  if (compiled.projection) {
    parts.push(`,`);
    parts.push(`  ${JSON.stringify(compiled.projection, null, 2).replace(/\n/g, '\n  ')}`);
  }
  parts.push(`)`);
  if (compiled.sort) {
    parts.push(`.sort(${JSON.stringify(compiled.sort)})`);
  }
  if (compiled.skip > 0) {
    parts.push(`.skip(${compiled.skip})`);
  }
  parts.push(`.limit(${compiled.limit});`);
  return parts.join('');
}

/**
 * Live find against a picked DB/collection (Shell mongosh runner).
 * Caps with Math.min(userLimit, FIND_RESULT_LIMIT) so the UI stays responsive.
 */
export function buildFindScript(
  database: string,
  collection: string,
  compiled: CompiledFind,
  hardCap: number = FIND_RESULT_LIMIT,
): string {
  const dbName = database.trim();
  const coll = collection.trim();
  if (!dbName) throw new Error('Database name is required.');
  if (!coll) throw new Error('Collection name is required.');
  const skip = Math.max(0, Math.floor(compiled.skip) || 0);
  // shortcut: UI hard-caps rows; raise FIND_RESULT_LIMIT if users need more
  const limit = Math.min(Math.max(1, Math.floor(compiled.limit) || hardCap), hardCap);
  const projectionArg = compiled.projection ? `, ${JSON.stringify(compiled.projection)}` : '';
  const sortArg = compiled.sort ? `.sort(${JSON.stringify(compiled.sort)})` : '';
  const skipArg = skip > 0 ? `.skip(${skip})` : '';
  return `print(EJSON.stringify(db.getSiblingDB(${JSON.stringify(dbName)}).getCollection(${JSON.stringify(coll)}).find(${JSON.stringify(compiled.filter)}${projectionArg})${sortArg}${skipArg}.limit(${limit}).toArray()));`;
}

/** Sync form state into the JSON editor text (when switching Form → JSON). */
export function findStateToJsonText(state: FindQueryState): string {
  const compiled = compileFromForm(state);
  return JSON.stringify(
    {
      filter: compiled.filter,
      projection: compiled.projection,
      sort: compiled.sort,
      skip: compiled.skip,
      limit: compiled.limit,
    },
    null,
    2,
  );
}
