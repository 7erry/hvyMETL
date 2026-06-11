import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import type { RelationshipConnectionType } from '../relationshipDisplay';

type RelationshipEdgeData = {
  highlighted?: boolean;
  connectionType?: RelationshipConnectionType;
};

function buildEdgePath(
  connectionType: RelationshipConnectionType,
  params: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: EdgeProps['sourcePosition'];
    targetPosition: EdgeProps['targetPosition'];
  },
): [path: string, labelX: number, labelY: number] {
  switch (connectionType) {
    case 'bezier':
      return getBezierPath(params);
    case 'straight':
      return getStraightPath(params);
    case 'step':
      return getSmoothStepPath({ ...params, borderRadius: 0 });
    case 'smoothstep':
    default:
      return getSmoothStepPath({ ...params, borderRadius: 12 });
  }
}

/** FK edge with selectable path style and optional label. */
export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeData = data as RelationshipEdgeData | undefined;
  const highlighted = Boolean(edgeData?.highlighted);
  const connectionType = edgeData?.connectionType ?? 'bezier';
  const [edgePath, labelX, labelY] = buildEdgePath(connectionType, {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: highlighted ? '#E3FCF7' : '#00A35C',
          strokeWidth: highlighted ? 2.5 : 1.75,
          ...style,
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={[
              'relationship-edge-label',
              highlighted ? 'highlighted' : '',
              label === 'N → 1' ? 'relationship-edge-label--cardinality' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
