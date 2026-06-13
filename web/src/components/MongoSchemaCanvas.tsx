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
import { CollectionNode, type CollectionNodeData } from './CollectionNode';
import {
  edgesForPlan,
  fieldsForCollection,
  relatedCollectionNames,
  type MongoCollectionEdge,
} from '../migrationPlanDisplay';
import type { RelationshipConnectionType, RelationshipNotation } from '../relationshipDisplay';
import type { MigrationPlan } from '../migrationPlanTypes';

const GRID = 20;
const nodeTypes = { collection: CollectionNode };
const edgeTypes = { relationship: RelationshipEdge };

type MongoSchemaCanvasProps = {
  plan: MigrationPlan | null;
  snapToGrid: boolean;
  connectionType: RelationshipConnectionType;
  relationshipNotation: RelationshipNotation;
  onConnectionTypeChange: (type: RelationshipConnectionType) => void;
  onRelationshipNotationChange: (notation: RelationshipNotation) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  positions: Record<string, { x: number; y: number }>;
  selectedCollection: string | null;
  onSelectCollection: (name: string | null) => void;
  onGeneratePlan?: () => void;
  generating?: boolean;
};

function snap(value: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / GRID) * GRID;
}

function edgeLabel(edge: MongoCollectionEdge, notation: RelationshipNotation): string {
  if (notation === 'cardinality') return edge.kind === 'embed' ? '1 → N' : '→';
  if (notation === 'minimal') return edge.kind;
  return edge.label;
}

function planToFlow(
  plan: MigrationPlan,
  positions: Record<string, { x: number; y: number }>,
  selectedCollection: string | null,
  connectionType: RelationshipConnectionType,
  relationshipNotation: RelationshipNotation,
): { nodes: Node<CollectionNodeData>[]; edges: Edge[] } {
  const planEdges = edgesForPlan(plan);
  const related = relatedCollectionNames(plan, selectedCollection);
  const hasSelection = Boolean(selectedCollection);

  const incomingTargets = new Set(planEdges.map((e) => e.target));
  const outgoingSources = new Set(planEdges.map((e) => e.source));
  const linkFieldsByCollection = new Map<string, string[]>();
  for (const edge of planEdges) {
    if (!edge.sourceHandle?.endsWith('-out')) continue;
    const list = linkFieldsByCollection.get(edge.source) ?? [];
    if (edge.sourceHandle.includes('-archive-out')) continue;
    const field = edge.sourceHandle.replace(/-out$/, '');
    if (!list.includes(field)) list.push(field);
    linkFieldsByCollection.set(edge.source, list);
  }

  const nodes: Node<CollectionNodeData>[] = plan.collections.map((collection, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const pos = positions[collection.name] ?? { x: col * 300 + 40, y: row * 260 + 40 };

    return {
      id: collection.name,
      type: 'collection',
      position: pos,
      data: {
        collection,
        fields: fieldsForCollection(collection),
        selected: collection.name === selectedCollection,
        related: related.has(collection.name),
        dimmed: hasSelection && !related.has(collection.name),
        linkFields: linkFieldsByCollection.get(collection.name) ?? [],
        hasIncoming: incomingTargets.has(collection.name),
        hasOutgoing: outgoingSources.has(collection.name),
      },
    };
  });

  const edges: Edge[] = planEdges.map((edge) => {
    const highlighted = selectedCollection === edge.source || selectedCollection === edge.target;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: 'relationship',
      label: edgeLabel(edge, relationshipNotation),
      data: {
        highlighted,
        connectionType,
        edgeKind: edge.kind,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: highlighted ? '#E3FCF7' : '#00ED64',
      },
      style: edge.kind === 'archive' ? { strokeDasharray: '6 4' } : undefined,
      zIndex: highlighted ? 2 : 0,
    };
  });

  return { nodes, edges };
}

export function MongoSchemaCanvas({
  plan,
  snapToGrid,
  connectionType,
  relationshipNotation,
  onConnectionTypeChange,
  onRelationshipNotationChange,
  onPositionsChange,
  positions,
  selectedCollection,
  onSelectCollection,
  onGeneratePlan,
  generating,
}: MongoSchemaCanvasProps) {
  const flow = useMemo(
    () =>
      plan
        ? planToFlow(plan, positions, selectedCollection, connectionType, relationshipNotation)
        : { nodes: [], edges: [] },
    [plan, positions, selectedCollection, connectionType, relationshipNotation],
  );

  const relationshipCount = useMemo(() => (plan ? edgesForPlan(plan).length : 0), [plan]);

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

  if (!plan) {
    return (
      <div className="schema-canvas-empty">
        <p>Generate a migration plan to preview MongoDB collections.</p>
        {onGeneratePlan ? (
          <button type="button" className="primary" onClick={onGeneratePlan} disabled={generating}>
            {generating ? 'Designing…' : 'Generate MongoDB schema'}
          </button>
        ) : null}
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
        onNodeClick={(_event, node) => onSelectCollection(node.id)}
        onPaneClick={() => onSelectCollection(null)}
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
        <MiniMap nodeColor="#014E3D" maskColor="rgba(0, 30, 43, 0.8)" style={{ background: '#112733' }} />
        <Panel position="bottom-center" className="schema-canvas-legend">
          <span>
            <span className="legend-dot legend-dot--pk">🔑</span> Document id
          </span>
          <span>
            <span className="legend-dot legend-dot--fk">⊕</span> Embedded array
          </span>
          <span>
            <span className="legend-dot legend-dot--denorm">⇢</span> Denormalized
          </span>
          <span>
            {plan.collections.length} collection{plan.collections.length === 1 ? '' : 's'}
          </span>
          <span>
            {relationshipCount} link{relationshipCount === 1 ? '' : 's'}
          </span>
          {selectedCollection ? <span className="legend-hint">Click canvas to clear selection</span> : null}
        </Panel>
      </ReactFlow>
    </div>
  );
}
