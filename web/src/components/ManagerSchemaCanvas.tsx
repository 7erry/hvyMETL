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
import { useMemo } from 'react';
import type { BusinessDomain } from '../managerDashboard';
import { ManagerEntityNode } from './ManagerEntityNode';
import { ManagerDomainNode } from './ManagerDomainNode';
import type { SchemaPhase } from '../sessionState';

const nodeTypes = {
  managerEntity: ManagerEntityNode,
  managerDomain: ManagerDomainNode,
};

const ENTITY_WIDTH = 148;
const ENTITY_HEIGHT = 72;
const DOMAIN_PAD = 24;
const DOMAIN_HEADER = 56;
const DOMAIN_GAP = 32;

type ManagerSchemaCanvasProps = {
  domains: BusinessDomain[];
  phase: SchemaPhase;
};

function layoutDomains(domains: BusinessDomain[]): Node[] {
  const nodes: Node[] = [];
  let xOffset = 40;

  for (const domain of domains) {
    const cols = Math.min(3, Math.max(1, domain.entities.length));
    const rows = Math.ceil(domain.entities.length / cols);
    const domainWidth = DOMAIN_PAD * 2 + cols * ENTITY_WIDTH + (cols - 1) * 12;
    const domainHeight = DOMAIN_HEADER + DOMAIN_PAD + rows * ENTITY_HEIGHT + (rows - 1) * 10;

    nodes.push({
      id: `domain-${domain.id}`,
      type: 'managerDomain',
      position: { x: xOffset, y: 40 },
      data: {
        label: domain.label,
        entityCount: domain.entities.length,
        readyCount: domain.entities.filter((e) => e.status === 'ready').length,
        reviewCount: domain.entities.filter((e) => e.status === 'review').length,
        blockedCount: domain.entities.filter((e) => e.status === 'blocked').length,
      },
      style: { width: domainWidth, height: domainHeight },
      selectable: false,
      draggable: false,
    });

    domain.entities.forEach((entity, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      nodes.push({
        id: entity.id,
        type: 'managerEntity',
        parentId: `domain-${domain.id}`,
        position: {
          x: DOMAIN_PAD + col * (ENTITY_WIDTH + 12),
          y: DOMAIN_HEADER + row * (ENTITY_HEIGHT + 10),
        },
        data: { entity },
        extent: 'parent',
        draggable: false,
      });
    });

    xOffset += domainWidth + DOMAIN_GAP;
  }

  return nodes;
}

export function ManagerSchemaCanvas({ domains, phase }: ManagerSchemaCanvasProps) {
  const nodes = useMemo(() => layoutDomains(domains), [domains]);

  if (domains.length === 0) {
    return (
      <div className="manager-canvas-empty">
        <h3>No schema loaded</h3>
        <p>Import a source schema to see the high-level migration map.</p>
      </div>
    );
  }

  return (
    <div className="manager-canvas schema-canvas-wrap">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#00684A" />
        <Controls showInteractive={false} />
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
        <Panel position="top-left" className="manager-canvas-legend">
          <span className="manager-legend__item manager-legend__item--ready">Ready</span>
          <span className="manager-legend__item manager-legend__item--review">Needs review</span>
          <span className="manager-legend__item manager-legend__item--blocked">Blocked</span>
          <span className="manager-legend__item manager-legend__item--pending">Pending</span>
          <span className="manager-canvas-legend__phase">
            View: {phase === 'before' ? 'Source SQL' : 'Target MongoDB'}
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}
