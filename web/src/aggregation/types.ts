export type StageKind =
  | 'match'
  | 'limit'
  | 'skip'
  | 'sample'
  | 'count'
  | 'project'
  | 'addFields'
  | 'set'
  | 'unset'
  | 'sort'
  | 'unwind'
  | 'group'
  | 'lookup'
  | 'unionWith'
  | 'out'
  | 'merge';

export type StageCategory = 'filter' | 'transformation' | 'joins';

export type MatchCompareOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';

export type MatchLogic = 'and' | 'or' | 'nor';

export type MatchNode =
  | { id: string; kind: 'group'; logic: MatchLogic; children: MatchNode[] }
  | { id: string; kind: 'expr'; field: string; op: MatchCompareOp; value: string };

export type StageEditMode = 'form' | 'json';

export type PipelineStage = {
  id: string;
  kind: StageKind;
  enabled: boolean;
  editMode: StageEditMode;
  /** Raw stage body JSON (without the $kind wrapper). */
  jsonText: string;
  matchTree?: MatchNode;
};

export type StagePaletteItem = {
  kind: StageKind;
  category: StageCategory;
  mongoOp: `$${StageKind}`;
  defaultJson: string;
};

export const STAGE_PALETTE: StagePaletteItem[] = [
  { kind: 'match', category: 'filter', mongoOp: '$match', defaultJson: '{\n  \n}' },
  { kind: 'limit', category: 'filter', mongoOp: '$limit', defaultJson: '10' },
  { kind: 'skip', category: 'filter', mongoOp: '$skip', defaultJson: '0' },
  { kind: 'sample', category: 'filter', mongoOp: '$sample', defaultJson: '{\n  "size": 5\n}' },
  { kind: 'count', category: 'filter', mongoOp: '$count', defaultJson: '"count"' },
  { kind: 'project', category: 'transformation', mongoOp: '$project', defaultJson: '{\n  \n}' },
  { kind: 'addFields', category: 'transformation', mongoOp: '$addFields', defaultJson: '{\n  \n}' },
  { kind: 'set', category: 'transformation', mongoOp: '$set', defaultJson: '{\n  \n}' },
  { kind: 'unset', category: 'transformation', mongoOp: '$unset', defaultJson: '[]' },
  { kind: 'sort', category: 'transformation', mongoOp: '$sort', defaultJson: '{\n  \n}' },
  { kind: 'unwind', category: 'transformation', mongoOp: '$unwind', defaultJson: '"$field"' },
  { kind: 'group', category: 'transformation', mongoOp: '$group', defaultJson: '{\n  "_id": null\n}' },
  { kind: 'lookup', category: 'joins', mongoOp: '$lookup', defaultJson: '{\n  "from": "",\n  "localField": "",\n  "foreignField": "",\n  "as": ""\n}' },
  { kind: 'unionWith', category: 'joins', mongoOp: '$unionWith', defaultJson: '{\n  "coll": ""\n}' },
  { kind: 'out', category: 'joins', mongoOp: '$out', defaultJson: '""' },
  { kind: 'merge', category: 'joins', mongoOp: '$merge', defaultJson: '{\n  "into": ""\n}' },
];

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultMatchTree(): MatchNode {
  return {
    id: newId(),
    kind: 'group',
    logic: 'and',
    children: [
      {
        id: newId(),
        kind: 'expr',
        field: 'status',
        op: 'eq',
        value: 'active',
      },
    ],
  };
}

export function createStage(kind: StageKind): PipelineStage {
  const item = STAGE_PALETTE.find((p) => p.kind === kind);
  const stage: PipelineStage = {
    id: newId(),
    kind,
    enabled: true,
    editMode: kind === 'match' ? 'form' : 'json',
    jsonText: item?.defaultJson ?? '{}',
  };
  if (kind === 'match') {
    stage.matchTree = defaultMatchTree();
  }
  return stage;
}

export function mongoOpFor(kind: StageKind): `$${StageKind}` {
  return `$${kind}`;
}
