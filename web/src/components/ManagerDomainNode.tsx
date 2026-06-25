import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';

export type ManagerDomainNodeData = {
  label: string;
  entityCount: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
};

function ManagerDomainNodeComponent({ data }: NodeProps & { data: ManagerDomainNodeData }) {
  return (
    <div className="manager-domain">
      <header className="manager-domain__header">
        <h3 className="manager-domain__title">{data.label}</h3>
        <span className="manager-domain__count">{data.entityCount} entities</span>
      </header>
      <div className="manager-domain__stats">
        {data.readyCount > 0 ? <span className="manager-domain__stat manager-domain__stat--ready">{data.readyCount} ready</span> : null}
        {data.reviewCount > 0 ? <span className="manager-domain__stat manager-domain__stat--review">{data.reviewCount} review</span> : null}
        {data.blockedCount > 0 ? <span className="manager-domain__stat manager-domain__stat--blocked">{data.blockedCount} blocked</span> : null}
      </div>
    </div>
  );
}

export const ManagerDomainNode = memo(ManagerDomainNodeComponent);
