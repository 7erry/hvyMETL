import type { PipelineStage } from './types';
import { compilePipeline } from './compilePipeline';
import { mongoOpFor } from './types';

function getPath(doc: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return doc[path];
  const parts = path.split('.');
  let cur: unknown = doc;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function matchPredicate(doc: Record<string, unknown>, filter: unknown): boolean {
  if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) return false;
  const obj = filter as Record<string, unknown>;

  if (Array.isArray(obj.$and)) {
    return obj.$and.every((clause) => matchPredicate(doc, clause));
  }
  if (Array.isArray(obj.$or)) {
    return obj.$or.some((clause) => matchPredicate(doc, clause));
  }
  if (Array.isArray(obj.$nor)) {
    return !obj.$nor.some((clause) => matchPredicate(doc, clause));
  }

  for (const [key, raw] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const actual = getPath(doc, key);
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const ops = raw as Record<string, unknown>;
      for (const [op, expected] of Object.entries(ops)) {
        switch (op) {
          case '$eq':
            if (actual !== expected) return false;
            break;
          case '$ne':
            if (actual === expected) return false;
            break;
          case '$gt':
            if (!((actual as number) > (expected as number))) return false;
            break;
          case '$gte':
            if (!((actual as number) >= (expected as number))) return false;
            break;
          case '$lt':
            if (!((actual as number) < (expected as number))) return false;
            break;
          case '$lte':
            if (!((actual as number) <= (expected as number))) return false;
            break;
          case '$in':
            if (!Array.isArray(expected) || !expected.includes(actual)) return false;
            break;
          case '$nin':
            if (!Array.isArray(expected) || expected.includes(actual)) return false;
            break;
          default:
            return false;
        }
      }
    } else if (actual !== raw) {
      return false;
    }
  }
  return true;
}

function applyStage(
  docs: Record<string, unknown>[],
  stage: Record<string, unknown>,
): Record<string, unknown>[] {
  const op = Object.keys(stage)[0];
  const body = stage[op];
  switch (op) {
    case '$match':
      return docs.filter((d) => matchPredicate(d, body));
    case '$limit': {
      const n = typeof body === 'number' ? body : Number(body);
      return docs.slice(0, Number.isFinite(n) ? Math.max(0, n) : docs.length);
    }
    case '$skip': {
      const n = typeof body === 'number' ? body : Number(body);
      return docs.slice(Number.isFinite(n) ? Math.max(0, n) : 0);
    }
    case '$sample': {
      const size =
        body !== null && typeof body === 'object' && !Array.isArray(body)
          ? Number((body as { size?: unknown }).size ?? 0)
          : 0;
      const copy = [...docs];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.max(0, size));
    }
    case '$count': {
      const field = typeof body === 'string' ? body : 'count';
      return [{ [field]: docs.length }];
    }
    case '$project': {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return docs;
      const spec = body as Record<string, unknown>;
      return docs.map((doc) => {
        const out: Record<string, unknown> = {};
        const includeId = spec._id !== 0 && spec._id !== false;
        if (includeId && '_id' in doc) out._id = doc._id;
        for (const [k, v] of Object.entries(spec)) {
          if (k === '_id') continue;
          if (v === 1 || v === true) out[k] = doc[k];
          else if (v === 0 || v === false) {
            /* exclude */
          } else out[k] = v;
        }
        return out;
      });
    }
    case '$sort': {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return docs;
      const spec = body as Record<string, number>;
      const keys = Object.keys(spec);
      return [...docs].sort((a, b) => {
        for (const key of keys) {
          const dir = spec[key] >= 0 ? 1 : -1;
          const av = a[key];
          const bv = b[key];
          if (av === bv) continue;
          if (av === undefined) return 1 * dir;
          if (bv === undefined) return -1 * dir;
          return (av < bv ? -1 : 1) * dir;
        }
        return 0;
      });
    }
    case '$addFields':
    case '$set': {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return docs;
      const spec = body as Record<string, unknown>;
      return docs.map((doc) => ({ ...doc, ...spec }));
    }
    case '$unset': {
      const fields = Array.isArray(body) ? body.map(String) : [String(body)];
      return docs.map((doc) => {
        const next = { ...doc };
        for (const f of fields) delete next[f.replace(/^\$/, '')];
        return next;
      });
    }
    case '$group': {
      // shortcut: mock group keeps one summary doc so Preview stays useful
      const id =
        body !== null && typeof body === 'object' && !Array.isArray(body)
          ? (body as { _id?: unknown })._id
          : null;
      return [{ _id: id ?? null, count: docs.length }];
    }
    case '$lookup':
    case '$unionWith':
    case '$unwind':
    case '$out':
    case '$merge':
      // shortcut: pass-through for stages without in-memory semantics
      return docs;
    default:
      return docs;
  }
}

export type PreviewStep = {
  stageId: string;
  op: string;
  input: Record<string, unknown>[];
  output: Record<string, unknown>[];
};

export type PreviewResult =
  | { ok: true; steps: PreviewStep[]; final: Record<string, unknown>[] }
  | { ok: false; error: string };

export function previewPipeline(
  stages: PipelineStage[],
  seedDocs: Record<string, unknown>[],
  throughStageId?: string | null,
): PreviewResult {
  const compiled = compilePipeline(stages);
  if (!compiled.ok) return { ok: false, error: compiled.error };

  const enabled = stages.filter((s) => s.enabled);
  let current = seedDocs.map((d) => ({ ...d }));
  const steps: PreviewStep[] = [];

  for (let i = 0; i < enabled.length; i += 1) {
    const stage = enabled[i];
    const pipeStage = compiled.pipeline[i];
    const input = current.map((d) => ({ ...d }));
    current = applyStage(current, pipeStage);
    steps.push({
      stageId: stage.id,
      op: mongoOpFor(stage.kind),
      input,
      output: current.map((d) => ({ ...d })),
    });
    if (throughStageId && stage.id === throughStageId) break;
  }

  return { ok: true, steps, final: current };
}
