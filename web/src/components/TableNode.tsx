import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TableModel } from '../types';
import { SQL_COLUMN_GLYPH } from '../fieldTagIcons';

export type TableNodeData = {
  table: TableModel;
  onDuplicate?: (name: string) => void;
  selected?: boolean;
  related?: boolean;
  dimmed?: boolean;
  fkColumns: string[];
  referencedColumns: string[];
};

function TableNodeComponent({ data }: NodeProps & { data: TableNodeData }) {
  const { table, onDuplicate, selected, related, dimmed, fkColumns, referencedColumns } = data;
  const fkSet = new Set(fkColumns);
  const refSet = new Set(referencedColumns);

  return (
    <div
      className={[
        'table-node',
        selected ? 'selected' : '',
        related && !selected ? 'related' : '',
        dimmed ? 'dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header>
        <span className="table-node__name">{table.name}</span>
        {onDuplicate && (
          <button
            type="button"
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(table.name);
            }}
            title="Duplicate table"
            aria-label={`Duplicate ${table.name}`}
          >
            ⧉
          </button>
        )}
      </header>
      <ul>
        {table.columns.map((col) => {
          const isPk = col.isPrimaryKey || table.primaryKey.includes(col.name);
          const isFk = fkSet.has(col.name);
          const isReferenced = refSet.has(col.name);
          const rowClass = [isPk ? 'pk' : '', isFk ? 'fk' : '', isReferenced && !isFk ? 'referenced' : '']
            .filter(Boolean)
            .join(' ');

          return (
            <li key={col.name} className={rowClass}>
              {isReferenced ? (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`${col.name}-in`}
                  className="column-handle column-handle--in"
                  title={`Referenced by other tables (${col.name})`}
                />
              ) : null}
              <span className="column-name">
                {isPk ? `${SQL_COLUMN_GLYPH.pk} ` : isFk ? `${SQL_COLUMN_GLYPH.fk} ` : ''}
                {col.name}
              </span>
              <span className="column-type">{col.sqlType}</span>
              {isFk ? (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${col.name}-out`}
                  className="column-handle column-handle--out"
                  title={`Foreign key (${col.name})`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
