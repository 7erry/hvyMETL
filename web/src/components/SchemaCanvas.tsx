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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo } from 'react';
import { TableNode, type TableNodeData } from './TableNode';
import type { SqlStructuralModel, TableModel } from '../types';

const GRID = 20;
const nodeTypes = { table: TableNode };

type SchemaCanvasProps = {
  model: SqlStructuralModel | null;
  snapToGrid: boolean;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  positions: Record<string, { x: number; y: number }>;
  onDuplicateTable: (name: string) => void;
};

function snap(value: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / GRID) * GRID;
}

function modelToFlow(
  model: SqlStructuralModel,
  positions: Record<string, { x: number; y: number }>,
  onDuplicate: (name: string) => void,
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const nodes: Node<TableNodeData>[] = model.tables.map((table, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const pos = positions[table.name] ?? { x: col * 280 + 40, y: row * 220 + 40 };
    return {
      id: table.name,
      type: 'table',
      position: pos,
      data: { table, onDuplicate },
    };
  });

  const edges: Edge[] = [];
  for (const table of model.tables) {
    for (const fk of table.foreignKeys) {
      edges.push({
        id: `${table.name}.${fk.column}->${fk.referencesTable}`,
        source: table.name,
        target: fk.referencesTable,
        label: fk.column,
        animated: true,
        style: { stroke: '#00ED64' },
      });
    }
  }
  return { nodes, edges };
}

export function SchemaCanvas({
  model,
  snapToGrid,
  onPositionsChange,
  positions,
  onDuplicateTable,
}: SchemaCanvasProps) {
  const flow = useMemo(
    () => (model ? modelToFlow(model, positions, onDuplicateTable) : { nodes: [], edges: [] }),
    [model, positions, onDuplicateTable],
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#889397',
          border: '1px dashed #00684A',
          borderRadius: 8,
          margin: '0.5rem',
        }}
      >
        Import a schema query or choose a template to visualize your ER diagram.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid={snapToGrid}
        snapGrid={[GRID, GRID]}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#00684A" />
        <Controls />
        <MiniMap
          nodeColor="#023430"
          maskColor="rgba(0, 30, 43, 0.8)"
          style={{ background: '#112733' }}
        />
      </ReactFlow>
    </div>
  );
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
