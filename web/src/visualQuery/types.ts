import { defaultMatchTree, newId, type MatchNode } from '../aggregation/types';

export type QueryEditMode = 'form' | 'json';

export type ProjectionRow = {
  id: string;
  field: string;
  include: boolean;
  enabled: boolean;
};

export type SortRow = {
  id: string;
  field: string;
  direction: 1 | -1;
  enabled: boolean;
};

export type FindQueryState = {
  filter: MatchNode;
  projectionEnabled: boolean;
  projection: ProjectionRow[];
  sort: SortRow[];
  skip: number;
  limit: number;
  editMode: QueryEditMode;
  /** Full find options JSON when editMode === 'json'. */
  jsonText: string;
};

export function createProjectionRow(field = '', include = true): ProjectionRow {
  return { id: newId(), field, include, enabled: true };
}

export function createSortRow(field = '', direction: 1 | -1 = 1): SortRow {
  return { id: newId(), field, direction, enabled: true };
}

export function defaultFindQueryState(): FindQueryState {
  return {
    filter: defaultMatchTree(),
    projectionEnabled: false,
    projection: [createProjectionRow('_id', true)],
    sort: [],
    skip: 0,
    limit: 200,
    editMode: 'form',
    jsonText: '{\n  "filter": {},\n  "projection": null,\n  "sort": null,\n  "skip": 0,\n  "limit": 200\n}',
  };
}
