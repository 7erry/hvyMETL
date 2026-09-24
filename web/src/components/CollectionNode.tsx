import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SchemaFieldTree } from './SchemaFieldTree';
import type { SchemaField } from '../schema/schemaFields';
import type { CollectionPlan } from '../migrationPlanTypes';

export type CollectionNodeData = {
  collection: CollectionPlan;
  schemaFields: SchemaField[];
  selected?: boolean;
  related?: boolean;
  dimmed?: boolean;
  /** Field names that emit embed/overflow/denorm edges. */
  linkFields: string[];
  /** Whether this collection receives incoming edges. */
  hasIncoming: boolean;
  /** Whether this collection has non-field outgoing edges. */
  hasOutgoing: boolean;
  /** Keys `${collectionName}:${fieldPath}` for expanded nested fields on the canvas. */
  expandedFieldPaths: Set<string>;
  onToggleFieldPath: (collectionName: string, fieldPath: string) => void;
};

function CollectionNodeComponent({ data }: NodeProps & { data: CollectionNodeData }) {
  const {
    collection,
    schemaFields,
    selected,
    related,
    dimmed,
    linkFields,
    hasIncoming,
    hasOutgoing,
    expandedFieldPaths,
    onToggleFieldPath,
  } = data;
  const linkSet = useMemo(() => new Set(linkFields), [linkFields]);

  const collectionExpandedPaths = useMemo(() => {
    const prefix = `${collection.name}:`;
    const paths = new Set<string>();
    for (const key of expandedFieldPaths) {
      if (key.startsWith(prefix)) paths.add(key.slice(prefix.length));
    }
    return paths;
  }, [collection.name, expandedFieldPaths]);

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
      <ul className="collection-node__fields">
        <SchemaFieldTree
          fields={schemaFields}
          collection={collection}
          variant="node"
          linkFields={linkSet}
          expandedPaths={collectionExpandedPaths}
          onTogglePath={(path) => onToggleFieldPath(collection.name, path)}
        />
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
