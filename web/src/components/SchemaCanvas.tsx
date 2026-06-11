import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodeDrag,
  BackgroundVariant,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo } from 'react';
import { RelationshipEdge } from './RelationshipEdge';
import { RelationshipDisplayControls } from './RelationshipDisplayControls';
import { TableNode, type TableNodeData } from './TableNode';
import {
  formatRelationshipLabel,
  type RelationshipConnectionType,
  type RelationshipNotation,
} from '../relationshipDisplay';
import type { SqlStructuralModel, TableModel } from '../types';

const GRID = 20;
const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };

type SchemaCanvasProps = {
  model: SqlStructuralModel | null;
  snapToGrid: boolean;
  connectionType: RelationshipConnectionType;
  relationshipNotation: RelationshipNotation;
  onConnectionTypeChange: (type: RelationshipConnectionType) => void;
  onRelationshipNotationChange: (notation: RelationshipNotation) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  positions: Record<string, { x: number; y: number }>;
  onDuplicateTable: (name: string) => void;
  selectedTable: string | null;
  onSelectTable: (name: string | null) => void;
};

function snap(value: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / GRID) * GRID;
}

/** Tables linked to the selection via any FK (in or out). */
function relatedTableNames(model: SqlStructuralModel, selectedTable: string | null): Set<string> {
  const related = new Set<string>();
  if (!selectedTable) return related;

  related.add(selectedTable);
  for (const table of model.tables) {
    if (table.name === selectedTable) {
      for (const fk of table.foreignKeys) related.add(fk.referencesTable);
    }
    if (table.foreignKeys.some((fk) => fk.referencesTable === selectedTable)) {
      related.add(table.name);
    }
  }
  return related;
}

/** Columns on each table that are referenced by foreign keys from other tables. */
function buildReferencedColumns(model: SqlStructuralModel): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const table of model.tables) {
    for (const fk of table.foreignKeys) {
      if (!map.has(fk.referencesTable)) map.set(fk.referencesTable, new Set());
      map.get(fk.referencesTable)!.add(fk.referencesColumn);
    }
  }
  return map;
}

function modelToFlow(
  model: SqlStructuralModel,
  positions: Record<string, { x: number; y: number }>,
  onDuplicate: (name: string) => void,
  selectedTable: string | null,
  connectionType: RelationshipConnectionType,
  relationshipNotation: RelationshipNotation,
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const tableNames = new Set(model.tables.map((t) => t.name));
  const referencedByColumn = buildReferencedColumns(model);
  const related = relatedTableNames(model, selectedTable);
  const hasSelection = Boolean(selectedTable);

  const nodes: Node<TableNodeData>[] = model.tables.map((table, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const pos = positions[table.name] ?? { x: col * 300 + 40, y: row * 240 + 40 };
    const fkColumns = table.foreignKeys.map((fk) => fk.column);
    const referencedColumns = [...(referencedByColumn.get(table.name) ?? [])];

    return {
      id: table.name,
      type: 'table',
      position: pos,
      data: {
        table,
        onDuplicate,
        selected: table.name === selectedTable,
        related: related.has(table.name),
        dimmed: hasSelection && !related.has(table.name),
        fkColumns,
        referencedColumns,
      },
    };
  });

  const edges: Edge[] = [];
  for (const table of model.tables) {
    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.referencesTable)) continue;

      const highlighted =
        selectedTable === table.name || selectedTable === fk.referencesTable;
      const label = formatRelationshipLabel(
        relationshipNotation,
        table.name,
        fk.column,
        fk.referencesTable,
        fk.referencesColumn,
      );

      edges.push({
        id: `${table.name}.${fk.column}->${fk.referencesTable}.${fk.referencesColumn}`,
        source: table.name,
        target: fk.referencesTable,
        sourceHandle: `${fk.column}-out`,
        targetHandle: `${fk.referencesColumn}-in`,
        type: 'relationship',
        label,
        data: {
          highlighted,
          connectionType,
          fkColumn: fk.column,
          refColumn: fk.referencesColumn,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: highlighted ? '#E3FCF7' : '#00A35C' },
        zIndex: highlighted ? 2 : 0,
      });
    }
  }

  return { nodes, edges };
}

export function SchemaCanvas({
  model,
  snapToGrid,
  connectionType,
  relationshipNotation,
  onConnectionTypeChange,
  onRelationshipNotationChange,
  onPositionsChange,
  positions,
  onDuplicateTable,
  selectedTable,
  onSelectTable,
}: SchemaCanvasProps) {
  const flow = useMemo(
    () =>
      model
        ? modelToFlow(
            model,
            positions,
            onDuplicateTable,
            selectedTable,
            connectionType,
            relationshipNotation,
          )
        : { nodes: [], edges: [] },
    [model, positions, onDuplicateTable, selectedTable, connectionType, relationshipNotation],
  );

  const relationshipCount = useMemo(
    () => model?.tables.reduce((n, t) => n + t.foreignKeys.length, 0) ?? 0,
    [model],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow.nodes, flow.edges, setNodes, setEdges]);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const shiftHeld = (_event as MouseEvent).shiftKey;
      const shouldSnap = snapToGrid && !shiftHeld;
      const x = snap(node.position.x, shouldSnap);
      const y = snap(node.position.y, shouldSnap);
      onPositionsChange({ ...positions, [node.id]: { x, y } });
      setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: { x, y } } : n)));
    },
    [snapToGrid, positions, onPositionsChange, setNodes],
  );

  if (!model) {
    return (
      <div className="schema-canvas-empty">
        Import a schema query or choose a template to visualize your ER diagram.
      </div>
    );
  }

  return (
    <div className="schema-canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_event, node) => onSelectTable(node.id)}
        onPaneClick={() => onSelectTable(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid={snapToGrid}
        snapGrid={[GRID, GRID]}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#00684A" />
        <Controls />
        <Panel position="top-right" className="schema-canvas-toolbar-panel">
          <RelationshipDisplayControls
            connectionType={connectionType}
            relationshipNotation={relationshipNotation}
            onConnectionTypeChange={onConnectionTypeChange}
            onRelationshipNotationChange={onRelationshipNotationChange}
          />
        </Panel>
        <MiniMap
          nodeColor="#023430"
          maskColor="rgba(0, 30, 43, 0.8)"
          style={{ background: '#112733' }}
        />
        <Panel position="bottom-center" className="schema-canvas-legend">
          <span><span className="legend-dot legend-dot--pk">🔑</span> Primary key</span>
          <span><span className="legend-dot legend-dot--fk">↗</span> Foreign key</span>
          <span>{relationshipCount} relationship{relationshipCount === 1 ? '' : 's'}</span>
          {selectedTable ? <span className="legend-hint">Click canvas to clear selection</span> : null}
        </Panel>
      </ReactFlow>
    </div>
  );
}

/** Remove a table from the model and clear its canvas position. */
export function deleteTableFromModel(
  model: SqlStructuralModel,
  tableName: string,
  positions: Record<string, { x: number; y: number }>,
): { model: SqlStructuralModel; positions: Record<string, { x: number; y: number }> } {
  const nextPositions = { ...positions };
  delete nextPositions[tableName];

  const tables = model.tables
    .filter((table) => table.name !== tableName)
    .map((table) => ({
      ...table,
      foreignKeys: table.foreignKeys.filter((fk) => fk.referencesTable !== tableName),
    }));

  const relationships = model.relationships.filter(
    (rel) => rel.childTable !== tableName && rel.parentTable !== tableName,
  );

  return {
    model: { ...model, tables, relationships },
    positions: nextPositions,
  };
}

/** Clone a table with a new name and offset position. */
export function duplicateTableInModel(
  model: SqlStructuralModel,
  tableName: string,
  positions: Record<string, { x: number; y: number }>,
): { model: SqlStructuralModel; positions: Record<string, { x: number; y: number }> } {
  const source = model.tables.find((t) => t.name === tableName);
  if (!source) return { model, positions };

  let copyName = `${tableName}_copy`;
  let n = 2;
  while (model.tables.some((t) => t.name === copyName)) {
    copyName = `${tableName}_copy${n}`;
    n += 1;
  }

  const clone: TableModel = {
    ...source,
    name: copyName,
    columns: source.columns.map((c) => ({ ...c })),
    foreignKeys: [],
    primaryKey: [...source.primaryKey],
  };

  const pos = positions[tableName] ?? { x: 40, y: 40 };
  return {
    model: { ...model, tables: [...model.tables, clone] },
    positions: { ...positions, [copyName]: { x: pos.x + 40, y: pos.y + 40 } },
  };
}
