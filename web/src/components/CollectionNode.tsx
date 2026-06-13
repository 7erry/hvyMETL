import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CollectionFieldRow } from '../migrationPlanDisplay';
import type { CollectionPlan } from '../migrationPlanTypes';

export type CollectionNodeData = {
  collection: CollectionPlan;
  fields: CollectionFieldRow[];
  selected?: boolean;
  related?: boolean;
  dimmed?: boolean;
  /** Field names that emit embed/overflow/denorm edges. */
  linkFields: string[];
  /** Whether this collection receives incoming edges. */
  hasIncoming: boolean;
  /** Whether this collection has non-field outgoing edges. */
  hasOutgoing: boolean;
};

function tagIcon(tags: string[]): string {
  if (tags.includes('id')) return '🔑 ';
  if (tags.includes('embed')) return '⊕ ';
  if (tags.includes('denorm')) return '⇢ ';
  if (tags.includes('computed')) return 'ƒ ';
  if (tags.includes('bucket')) return '⏱ ';
  if (tags.includes('index')) return '◆ ';
  return '';
}

function CollectionNodeComponent({ data }: NodeProps & { data: CollectionNodeData }) {
  const { collection, fields, selected, related, dimmed, linkFields, hasIncoming, hasOutgoing } = data;
  const linkSet = new Set(linkFields);

  const patternLabels = [...new Set(collection.patterns.map((p) => p.pattern))].slice(0, 3);

  return (
    <div
      className={[
        'collection-node',
        selected ? 'selected' : '',
        related && !selected ? 'related' : '',
        dimmed ? 'dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header>
        {hasIncoming ? (
          <Handle
            type="target"
            position={Position.Left}
            id={`${collection.name}-in`}
            className="column-handle column-handle--in collection-handle"
            title="Incoming relationship"
          />
        ) : null}
        <span className="collection-node__name">{collection.name}</span>
        <span className="collection-node__badge">MongoDB</span>
        {hasOutgoing ? (
          <Handle
            type="source"
            position={Position.Right}
            id={`${collection.name}-header-out`}
            className="column-handle column-handle--out collection-handle"
            title="Outgoing relationship"
          />
        ) : null}
      </header>
      <p className="collection-node__source">from {collection.sourceTable}</p>
      {collection.mergedTables.filter((table) => table !== collection.sourceTable).length > 0 ? (
        <p className="collection-node__merged">
          + {collection.mergedTables.filter((table) => table !== collection.sourceTable).join(', ')}
        </p>
      ) : null}
      {patternLabels.length > 0 ? (
        <div className="collection-node__patterns">
          {patternLabels.map((p) => (
            <span key={p} className="collection-node__pattern">
              {p}
            </span>
          ))}
        </div>
      ) : null}
      <ul>
        {fields.map((field) => {
          const isLink = linkSet.has(field.name);
          const rowClass = [
            field.tags.includes('id') ? 'pk' : '',
            field.tags.includes('embed') ? 'embed' : '',
            field.tags.includes('denorm') ? 'denorm' : '',
            isLink ? 'linked' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={field.name} className={rowClass}>
              <span className="column-name">
                {tagIcon(field.tags)}
                {field.name}
              </span>
              <span className="column-type">{field.bsonType}</span>
              {isLink ? (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${field.name}-out`}
                  className="column-handle column-handle--out"
                  title={`Linked field (${field.name})`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {collection.archive ? (
        <footer className="collection-node__footer">
          <Handle
            type="source"
            position={Position.Right}
            id={`${collection.name}-archive-out`}
            className="column-handle column-handle--out"
            title="Archive mirror"
          />
          archive → {collection.archive.archiveCollection}
        </footer>
      ) : null}
    </div>
  );
}

export const CollectionNode = memo(CollectionNodeComponent);
