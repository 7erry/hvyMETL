import type { MatchCompareOp, MatchLogic, MatchNode, PipelineStage, StageKind } from './types';
import { mongoOpFor } from './types';

const COMPARE_TO_MONGO: Record<MatchCompareOp, string> = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  in: '$in',
  nin: '$nin',
};

export function parseFormValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

function logicKey(logic: MatchLogic): string {
  switch (logic) {
    case 'and':
      return '$and';
    case 'or':
      return '$or';
    case 'nor':
      return '$nor';
    default: {
      const _exhaustive: never = logic;
      return _exhaustive;
    }
  }
}

export function compileMatchNode(node: MatchNode): Record<string, unknown> {
  if (node.kind === 'group') {
    return { [logicKey(node.logic)]: node.children.map((child) => compileMatchNode(child)) };
  }
  const mongoOp = COMPARE_TO_MONGO[node.op];
  const value = parseFormValue(node.value);
  if (node.op === 'eq') {
    return { [node.field]: value };
  }
  return { [node.field]: { [mongoOp]: value } };
}

function parseStageBody(jsonText: string): unknown {
  const trimmed = jsonText.trim();
  if (trimmed === '') return {};
  return JSON.parse(trimmed) as unknown;
}

export type CompileResult =
  | { ok: true; pipeline: Record<string, unknown>[] }
  | { ok: false; error: string; stageId?: string };

export function compilePipeline(stages: PipelineStage[]): CompileResult {
  const pipeline: Record<string, unknown>[] = [];
  for (const stage of stages) {
    if (!stage.enabled) continue;
    const op = mongoOpFor(stage.kind);
    try {
      if (stage.kind === 'match' && stage.editMode === 'form' && stage.matchTree) {
        pipeline.push({ [op]: compileMatchNode(stage.matchTree) });
        continue;
      }
      const body = parseStageBody(stage.jsonText);
      pipeline.push({ [op]: body });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Invalid JSON in ${op}: ${message}`, stageId: stage.id };
    }
  }
  return { ok: true, pipeline };
}

export function formatPipelineAsCode(
  collection: string,
  pipeline: Record<string, unknown>[],
): string {
  return `db.${collection}.aggregate(${JSON.stringify(pipeline, null, 2)})`;
}

export function stageKindLabel(kind: StageKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
