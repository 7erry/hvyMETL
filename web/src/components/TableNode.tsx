import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TableModel } from '../types';

export type TableNodeData = {
  table: TableModel;
  onDuplicate?: (name: string) => void;
};

function TableNodeComponent({ data }: NodeProps & { data: TableNodeData }) {
  const { table, onDuplicate } = data;
  return (
    <div className="table-node">
      <Handle type="target" position={Position.Left} style={{ background: '#00ED64' }} />
      <header>
        {table.name}
        {onDuplicate && (
          <button
            type="button"
            className="ghost"
            style={{ float: 'right', padding: '0 0.35rem', fontSize: '0.7rem' }}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(table.name);
            }}
            title="Duplicate table"
          >
            ⧉
          </button>
        )}
      </header>
      <ul>
        {table.columns.map((col) => (
          <li key={col.name} className={col.isPrimaryKey || table.primaryKey.includes(col.name) ? 'pk' : ''}>
            {col.isPrimaryKey || table.primaryKey.includes(col.name) ? '🔑 ' : ''}
            {col.name} <span style={{ opacity: 0.6 }}>{col.sqlType}</span>
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} style={{ background: '#00ED64' }} />
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
