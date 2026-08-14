/**
 * Layout diagram nodes so related entities cluster together with readable spacing.
 */

import { edgesForPlan } from './migrationPlanDisplay';
import { analyzeMigrationRisks, guardrailsByTable } from './copilot/guardrails';
import { estimateDynamoTableNodeHeight } from './dynamoTableDisplay';
import type { MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel, TableModel } from './types';

export type GraphLayoutEdge = { source: string; target: string };

export type GraphLayoutNodeSize = { width: number; height: number };

export type GraphLayoutOptions = {
  nodeWidth?: number;
  nodeHeight?: number;
  gapX?: number;
  gapY?: number;
  padding?: number;
  componentGapX?: number;
  componentGapY?: number;
  grid?: number;
  maxRowWidth?: number;
};

/** Canvas dot grid (px); two dots = minimum gap between stacked nodes. */
export const DIAGRAM_GRID_UNIT = 20;
export const DIAGRAM_TWO_DOT_GAP = DIAGRAM_GRID_UNIT * 2;

const DEFAULTS: Required<GraphLayoutOptions> = {
  nodeWidth: 280,
  nodeHeight: 200,
  gapX: 160,
  gapY: 72,
  padding: 48,
  componentGapX: 200,
  componentGapY: 140,
  grid: 20,
  maxRowWidth: 2600,
};

/** Tighter spacing for narrow viewports so diagrams remain readable on mobile. */
export const COMPACT_GRAPH_LAYOUT_OPTIONS: GraphLayoutOptions = {
  nodeWidth: 200,
  nodeHeight: 150,
  gapX: 72,
  gapY: 40,
  padding: 28,
  componentGapX: 88,
  componentGapY: DIAGRAM_TWO_DOT_GAP,
  maxRowWidth: 720,
};

/** Default After · MongoDB spacing — two grid dots (40px) between collections. */
export const MONGO_GRAPH_LAYOUT_OPTIONS: GraphLayoutOptions = {
  nodeWidth: 260,
  nodeHeight: 170,
  gapX: 40,
  gapY: DIAGRAM_TWO_DOT_GAP,
  padding: 40,
  componentGapX: 40,
  componentGapY: DIAGRAM_TWO_DOT_GAP,
  grid: DIAGRAM_GRID_UNIT,
  maxRowWidth: 1600,
};

/** Default Before · SQL spacing — two grid dots between tables vertically. */
export const SQL_GRAPH_LAYOUT_OPTIONS: GraphLayoutOptions = {
  nodeWidth: 260,
  nodeHeight: 200,
  gapX: 160,
  gapY: DIAGRAM_TWO_DOT_GAP,
  padding: 48,
  componentGapX: 200,
  componentGapY: DIAGRAM_TWO_DOT_GAP,
  grid: DIAGRAM_GRID_UNIT,
  maxRowWidth: 2600,
};

function sqlVerticalGap(options: Required<GraphLayoutOptions>): number {
  return Math.max(options.gapY, options.grid * 2);
}

function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function connectedComponents(nodeIds: string[], edges: GraphLayoutEdge[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const edge of edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source)?.add(edge.target);
    adj.get(edge.target)?.add(edge.source);
  }

  const seen = new Set<string>();
  const components: string[][] = [];
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    const stack = [id];
    const component: string[] = [];
    seen.add(id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function layoutComponent(
  nodeIds: string[],
  edges: GraphLayoutEdge[],
  sizes: Map<string, GraphLayoutNodeSize>,
  options: Required<GraphLayoutOptions>,
): Record<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, gapX, gapY, grid } = options;

  const childrenOf = new Map<string, string[]>();
  for (const id of nodeIds) childrenOf.set(id, []);
  for (const edge of edges) {
    if (!nodeIds.includes(edge.source) || !nodeIds.includes(edge.target)) continue;
    childrenOf.get(edge.target)?.push(edge.source);
  }

  const roots = nodeIds.filter((id) => !edges.some((edge) => edge.source === id));
  const levels = new Map<string, number>();
  const queue = roots.length > 0 ? [...roots] : nodeIds.length > 0 ? [nodeIds[0]] : [];
  for (const root of queue) levels.set(root, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const level = levels.get(id) ?? 0;
    for (const child of childrenOf.get(id) ?? []) {
      const nextLevel = level + 1;
      if (!levels.has(child)) {
        levels.set(child, nextLevel);
        queue.push(child);
      } else {
        levels.set(child, Math.max(levels.get(child)!, nextLevel));
      }
    }
  }

  for (const id of nodeIds) {
    if (!levels.has(id)) levels.set(id, 0);
  }

  const byLevel = new Map<number, string[]>();
  for (const id of nodeIds) {
    const level = levels.get(id)!;
    const column = byLevel.get(level) ?? [];
    column.push(id);
    byLevel.set(level, column);
  }

  const maxLevel = Math.max(0, ...nodeIds.map((id) => levels.get(id)!));
  const levelWidths: number[] = [];
  for (let level = 0; level <= maxLevel; level += 1) {
    const column = byLevel.get(level) ?? [];
    let maxWidth = nodeWidth;
    for (const id of column) {
      maxWidth = Math.max(maxWidth, sizes.get(id)?.width ?? nodeWidth);
    }
    levelWidths[level] = maxWidth;
  }

  const positions: Record<string, { x: number; y: number }> = {};
  let x = 0;
  for (let level = 0; level <= maxLevel; level += 1) {
    const column = (byLevel.get(level) ?? []).sort();
    let y = 0;
    for (const id of column) {
      const size = sizes.get(id) ?? { width: nodeWidth, height: nodeHeight };
      positions[id] = { x: snap(x, grid), y: snap(y, grid) };
      y += size.height + gapY;
    }
    x += levelWidths[level] + gapX;
  }

  return positions;
}

function boundingBox(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: string[],
  sizes: Map<string, GraphLayoutNodeSize>,
  options: Required<GraphLayoutOptions>,
): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const id of nodeIds) {
    const pos = positions[id];
    if (!pos) continue;
    const size = sizes.get(id) ?? { width: options.nodeWidth, height: options.nodeHeight };
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
  }
  return { width: maxX, height: maxY };
}

/** Layout nodes by relationship edges; unrelated groups are packed in separate clusters. */
export function layoutGraph(
  nodeIds: string[],
  edges: GraphLayoutEdge[],
  sizes?: Map<string, GraphLayoutNodeSize>,
  opts?: GraphLayoutOptions,
): Record<string, { x: number; y: number }> {
  const options: Required<GraphLayoutOptions> = { ...DEFAULTS, ...opts };
  const sizeMap = sizes ?? new Map<string, GraphLayoutNodeSize>();
  if (nodeIds.length === 0) return {};

  const components = connectedComponents(nodeIds, edges).sort((a, b) => b.length - a.length);
  const allPositions: Record<string, { x: number; y: number }> = {};

  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowMaxHeight = 0;

  for (const component of components) {
    const componentEdges = edges.filter(
      (edge) => component.includes(edge.source) && component.includes(edge.target),
    );
    const local = layoutComponent(component, componentEdges, sizeMap, options);
    const bbox = boundingBox(local, component, sizeMap, options);

    if (cursorX + bbox.width > options.maxRowWidth && cursorX > options.padding) {
      cursorX = options.padding;
      cursorY += rowMaxHeight + options.componentGapY;
      rowMaxHeight = 0;
    }

    for (const id of component) {
      const point = local[id];
      if (!point) continue;
      allPositions[id] = {
        x: snap(cursorX + point.x, options.grid),
        y: snap(cursorY + point.y, options.grid),
      };
    }

    cursorX += bbox.width + options.componentGapX;
    rowMaxHeight = Math.max(rowMaxHeight, bbox.height);
  }

  return allPositions;
}

export function estimateTableNodeSize(
  table: TableModel,
  options?: { hasGuardrailBadge?: boolean },
): GraphLayoutNodeSize {
  if (table.dynamoDb) {
    const guardrailSlack = options?.hasGuardrailBadge ? 22 : 0;
    return {
      width: 400,
      height: estimateDynamoTableNodeHeight(table) + guardrailSlack,
    };
  }

  const headerHeight = 52;
  const guardrailSlack = options?.hasGuardrailBadge ? 22 : 0;
  const duplicateControlSlack = 8;
  const listPadding = 16;
  const rowHeight = 30;
  const borderSlack = 2;
  return {
    width: 280,
    height:
      headerHeight
      + guardrailSlack
      + duplicateControlSlack
      + listPadding
      + table.columns.length * rowHeight
      + borderSlack,
  };
}

export function estimateCollectionNodeSize(fieldCount: number, mergedCount: number): GraphLayoutNodeSize {
  const visibleRows = Math.min(fieldCount, 12);
  const mergedLines = mergedCount > 1 ? 1 : 0;
  return { width: 280, height: 72 + mergedLines * 16 + visibleRows * 22 };
}

function sqlEdges(model: SqlStructuralModel): GraphLayoutEdge[] {
  const names = new Set(model.tables.map((table) => table.name));
  const edges: GraphLayoutEdge[] = [];
  for (const table of model.tables) {
    for (const fk of table.foreignKeys) {
      if (names.has(fk.referencesTable)) {
        edges.push({ source: table.name, target: fk.referencesTable });
      }
    }
  }
  return edges;
}

/** How a SQL table participates in FK relationships (Before canvas columns). */
type SqlReferenceRole = 'outgoingOnly' | 'both' | 'incomingOnly' | 'isolated';

function classifySqlReferenceRole(
  table: TableModel,
  tableNames: Set<string>,
  incomingFkCount: Map<string, number>,
): SqlReferenceRole {
  const hasOutgoing = table.foreignKeys.some((fk) => tableNames.has(fk.referencesTable));
  const hasIncoming = (incomingFkCount.get(table.name) ?? 0) > 0;
  if (hasOutgoing && hasIncoming) return 'both';
  if (hasOutgoing) return 'outgoingOnly';
  if (hasIncoming) return 'incomingOnly';
  return 'isolated';
}

const SQL_ROLE_COLUMN: Record<SqlReferenceRole, number> = {
  outgoingOnly: 0,
  both: 1,
  incomingOnly: 2,
  isolated: 1,
};

/**
 * Before · SQL canvas: left = outgoing-only, center = hub/isolated, right = incoming-only.
 */
function layoutSqlTablesByReferenceRole(
  nodeIds: string[],
  model: SqlStructuralModel,
  sizes: Map<string, GraphLayoutNodeSize>,
  options: Required<GraphLayoutOptions>,
): Record<string, { x: number; y: number }> {
  const { nodeWidth, nodeHeight, gapX, gapY, padding, grid } = options;
  const verticalGap = sqlVerticalGap(options);
  const tableNames = new Set(nodeIds);
  const tablesByName = new Map(model.tables.map((table) => [table.name, table]));

  const incomingFkCount = new Map<string, number>();
  for (const id of nodeIds) incomingFkCount.set(id, 0);
  for (const id of nodeIds) {
    const table = tablesByName.get(id);
    if (!table) continue;
    for (const fk of table.foreignKeys) {
      if (tableNames.has(fk.referencesTable)) {
        incomingFkCount.set(fk.referencesTable, (incomingFkCount.get(fk.referencesTable) ?? 0) + 1);
      }
    }
  }

  const columns: string[][] = [[], [], []];
  for (const id of nodeIds) {
    const table = tablesByName.get(id);
    if (!table) continue;
    const role = classifySqlReferenceRole(table, tableNames, incomingFkCount);
    columns[SQL_ROLE_COLUMN[role]]!.push(id);
  }
  for (const column of columns) column.sort();

  const positions: Record<string, { x: number; y: number }> = {};
  let x = padding;
  for (const column of columns) {
    let maxWidth = nodeWidth;
    let y = padding;
    for (const id of column) {
      const size = sizes.get(id) ?? { width: nodeWidth, height: nodeHeight };
      maxWidth = Math.max(maxWidth, size.width);
      positions[id] = { x: snap(x, grid), y: snap(y, grid) };
      y += size.height + verticalGap;
    }
    x += maxWidth + gapX;
  }

  return positions;
}

function mongoEdges(plan: MigrationPlan): GraphLayoutEdge[] {
  return edgesForPlan(plan).map((edge) => ({ source: edge.source, target: edge.target }));
}

/** Layout SQL tables: FK role columns (sources left, hubs center, sinks right) per connected cluster. */
export function layoutSqlModel(model: SqlStructuralModel, opts?: GraphLayoutOptions): Record<string, { x: number; y: number }> {
  const options: Required<GraphLayoutOptions> = { ...DEFAULTS, ...SQL_GRAPH_LAYOUT_OPTIONS, ...opts };
  const nodeIds = model.tables.map((table) => table.name);
  const guardrailMap = guardrailsByTable(analyzeMigrationRisks(model));
  const sizes = new Map<string, GraphLayoutNodeSize>();
  for (const table of model.tables) {
    const hasGuardrailBadge = (guardrailMap.get(table.name)?.length ?? 0) > 0;
    sizes.set(table.name, estimateTableNodeSize(table, { hasGuardrailBadge }));
  }
  if (nodeIds.length === 0) return {};

  const edges = sqlEdges(model);
  const components = connectedComponents(nodeIds, edges).sort((a, b) => b.length - a.length);
  const allPositions: Record<string, { x: number; y: number }> = {};

  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowMaxHeight = 0;

  for (const component of components) {
    const local = layoutSqlTablesByReferenceRole(component, model, sizes, options);
    const bbox = boundingBox(local, component, sizes, options);

    if (cursorX + bbox.width > options.maxRowWidth && cursorX > options.padding) {
      cursorX = options.padding;
      cursorY += rowMaxHeight + options.componentGapY;
      rowMaxHeight = 0;
    }

    for (const id of component) {
      const point = local[id];
      if (!point) continue;
      allPositions[id] = {
        x: snap(cursorX + point.x - options.padding, options.grid),
        y: snap(cursorY + point.y - options.padding, options.grid),
      };
    }

    cursorX += bbox.width + options.componentGapX;
    rowMaxHeight = Math.max(rowMaxHeight, bbox.height);
  }

  return allPositions;
}

/** Layout MongoDB collections grouped by embed / reference / overflow edges. */
export function layoutMigrationPlan(
  plan: MigrationPlan,
  opts?: GraphLayoutOptions,
): Record<string, { x: number; y: number }> {
  const nodeIds = plan.collections.map((collection) => collection.name);
  const sizes = new Map<string, GraphLayoutNodeSize>();
  for (const collection of plan.collections) {
    const fieldCount = Object.keys(
      (collection.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {},
    ).length;
    const mergedCount = collection.mergedTables.length;
    sizes.set(collection.name, estimateCollectionNodeSize(fieldCount, mergedCount));
  }
  return layoutGraph(nodeIds, mongoEdges(plan), sizes, opts);
}
