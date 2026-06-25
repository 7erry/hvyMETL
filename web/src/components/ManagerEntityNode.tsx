import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { ManagerEntity } from '../managerDashboard';

export type ManagerEntityNodeData = {
  entity: ManagerEntity;
};

function ManagerEntityNodeComponent({ data }: NodeProps & { data: ManagerEntityNodeData }) {
  const { entity } = data;
  const kindLabel = entity.kind === 'sql-table' ? 'SQL Table' : 'MongoDB Collection';

  return (
    <div className={`manager-entity manager-entity--${entity.status}`} title={entity.statusLabel}>
      <span className="manager-entity__status-dot" aria-hidden />
      <span className="manager-entity__name">{entity.name}</span>
      <span className="manager-entity__kind">{kindLabel}</span>
      <span className="manager-entity__status-label">{entity.statusLabel}</span>
    </div>
  );
}

export const ManagerEntityNode = memo(ManagerEntityNodeComponent);
