import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useRef, useState } from 'react';
import { DiagramCanvasFitView } from './DiagramCanvasFitView';
import { useCompactDiagramLayout } from '../hooks/useCompactDiagramLayout';
import type { BusinessDomain } from '../managerDashboard';
import { ManagerEntityNode } from './ManagerEntityNode';
import { ManagerDomainNode } from './ManagerDomainNode';
import type { SchemaPhase } from '../sessionState';

const nodeTypes = {
  managerEntity: ManagerEntityNode,
  managerDomain: ManagerDomainNode,
};

const ENTITY_WIDTH = 168;
const ENTITY_HEIGHT = 80;
const DOMAIN_PAD = 28;
const DOMAIN_HEADER = 52;
const DOMAIN_GAP_X = 48;
const DOMAIN_GAP_Y = 40;
const CANVAS_CENTER_X = 520;
const CANVAS_CENTER_Y = 320;

type DomainLayout = {
  domain: BusinessDomain;
  width: number;
  height: number;
  entityNodes: Node[];
};

function measureDomain(domain: BusinessDomain): DomainLayout {
  const cols = Math.min(3, Math.max(1, domain.entities.length));
  const rows = Math.ceil(domain.entities.length / cols);
  const width = DOMAIN_PAD * 2 + cols * ENTITY_WIDTH + (cols - 1) * 14;
  const height = DOMAIN_HEADER + DOMAIN_PAD + rows * ENTITY_HEIGHT + (rows - 1) * 12;

  const entityNodes: Node[] = domain.entities.map((entity, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      id: entity.id,
      type: 'managerEntity',
      parentId: `domain-${domain.id}`,
      position: {
        x: DOMAIN_PAD + col * (ENTITY_WIDTH + 14),
        y: DOMAIN_HEADER + row * (ENTITY_HEIGHT + 12),
      },
      data: { entity },
      extent: 'parent' as const,
      draggable: false,
    };
  });

  return { domain, width, height, entityNodes };
}

function layoutDomains(domains: BusinessDomain[]): Node[] {
  if (domains.length === 0) return [];

  const layouts = domains.map(measureDomain);
  const gridCols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(layouts.length))));
  const rows: DomainLayout[][] = [];

  for (let index = 0; index < layouts.length; index += gridCols) {
    rows.push(layouts.slice(index, index + gridCols));
  }

  const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height)));
  const rowWidths = rows.map((row) =>
    row.reduce((sum, item, index) => sum + item.width + (index > 0 ? DOMAIN_GAP_X : 0), 0),
  );
  const totalHeight =
    rowHeights.reduce((sum, height) => sum + height, 0) + (rows.length - 1) * DOMAIN_GAP_Y;

  let y = CANVAS_CENTER_Y - totalHeight / 2;
  const nodes: Node[] = [];

  rows.forEach((row, rowIndex) => {
    const rowWidth = rowWidths[rowIndex] ?? 0;
    let x = CANVAS_CENTER_X - rowWidth / 2;

    for (const layout of row) {
      nodes.push({
        id: `domain-${layout.domain.id}`,
        type: 'managerDomain',
        position: { x, y },
        data: {
          label: layout.domain.label,
          entityCount: layout.domain.entities.length,
          readyCount: layout.domain.entities.filter((e) => e.status === 'ready').length,
          reviewCount: layout.domain.entities.filter((e) => e.status === 'review').length,
          blockedCount: layout.domain.entities.filter((e) => e.status === 'blocked').length,
        },
        style: { width: layout.width, height: layout.height },
        selectable: false,
        draggable: false,
      });
      nodes.push(...layout.entityNodes);
      x += layout.width + DOMAIN_GAP_X;
    }

    y += (rowHeights[rowIndex] ?? 0) + DOMAIN_GAP_Y;
  });

  return nodes;
}

type ManagerSchemaCanvasProps = {
  domains: BusinessDomain[];
  phase: SchemaPhase;
  onReviewEntity?: (entityId: string) => void;
};

export function ManagerSchemaCanvas({ domains, phase, onReviewEntity }: ManagerSchemaCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const compactLayout = useCompactDiagramLayout();
  const [legendOpen, setLegendOpen] = useState(false);
  const legendHint = phase === 'before' ? 'Source SQL' : 'Target MongoDB';
  const nodes = useMemo(() => layoutDomains(domains), [domains]);
  const entityCount = domains.reduce((sum, domain) => sum + domain.entities.length, 0);

  if (domains.length === 0) {
    return (
      <div className="manager-canvas-empty">
        <h3>No schema loaded</h3>
        <p>Import a DDL script or SQLite database using the panel in the sidebar, then run design to see the migration map.</p>
      </div>
    );
  }

  return (
    <div className="manager-canvas schema-canvas-wrap" ref={wrapRef}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: compactLayout ? 0.08 : 0.2 }}
        minZoom={0.2}
        maxZoom={compactLayout ? 1.1 : 1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onReviewEntity)}
        onNodeClick={(_, node) => {
          if (node.type !== 'managerEntity' || !onReviewEntity) return;
          onReviewEntity(node.id);
        }}
        panOnScroll
      >
        <DiagramCanvasFitView
          fitKey={`${entityCount}-${phase}-${compactLayout ? 'compact' : 'wide'}`}
          padding={compactLayout ? 0.08 : 0.15}
          containerRef={wrapRef}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#00684A" />
        <Controls showInteractive={false} />
        {!compactLayout ? (
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'managerDomain') return '#023430';
              const entity = (node.data as { entity?: { status: string } }).entity;
              if (entity?.status === 'ready') return '#00ed64';
              if (entity?.status === 'review') return '#ffb347';
              if (entity?.status === 'blocked') return '#ff6b6b';
              return '#6b8f8a';
            }}
            maskColor="rgba(0, 30, 43, 0.8)"
            style={{ background: '#112733' }}
          />
        ) : null}
        <Panel position="bottom-right" className="manager-canvas-legend-panel">
          <details
            className="manager-canvas-legend manager-canvas-legend--collapsible"
            open={legendOpen}
            onToggle={(event) => setLegendOpen(event.currentTarget.open)}
          >
            <summary className="manager-canvas-legend__summary">
              <span>Legend</span>
              {!legendOpen ? <span className="manager-canvas-legend__hint">{legendHint}</span> : null}
            </summary>
            <div className="manager-canvas-legend__body">
              <span className="manager-legend__item manager-legend__item--ready">Ready</span>
              <span className="manager-legend__item manager-legend__item--review">Review</span>
              <span className="manager-legend__item manager-legend__item--blocked">Blocked</span>
              <span className="manager-legend__item manager-legend__item--pending">Pending</span>
            </div>
          </details>
        </Panel>
      </ReactFlow>
    </div>
  );
}
