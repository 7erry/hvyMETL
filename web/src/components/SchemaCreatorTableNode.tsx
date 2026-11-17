import { memo, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SCHEMA_CREATOR_SQL_TYPES } from '../schemaCreator/schemaCreatorModel';
import type { ColumnModel, TableModel } from '../types';
import { useT } from '../i18n/LocaleContext';

export type SchemaCreatorTableNodeData = {
  table: TableModel;
  selected?: boolean;
  onRenameTable: (tableName: string, nextName: string) => void;
  onDeleteTable: (tableName: string) => void;
  onAddColumn: (tableName: string) => void;
  onRenameColumn: (tableName: string, columnName: string, nextName: string) => void;
  onChangeColumnType: (tableName: string, columnName: string, sqlType: string) => void;
  onTogglePk: (tableName: string, columnName: string) => void;
  onDeleteColumn: (tableName: string, columnName: string) => void;
};

function typeOptions(current: string): string[] {
  return SCHEMA_CREATOR_SQL_TYPES.includes(current as (typeof SCHEMA_CREATOR_SQL_TYPES)[number])
    ? [...SCHEMA_CREATOR_SQL_TYPES]
    : [current, ...SCHEMA_CREATOR_SQL_TYPES];
}

function SchemaCreatorTableNodeComponent({
  data,
}: NodeProps & { data: SchemaCreatorTableNodeData }): ReactElement {
  const t = useT();
  const { table, selected } = data;

  return (
    <div className={['table-node', 'schema-creator-node', selected ? 'selected' : ''].filter(Boolean).join(' ')}>
      <header>
        <input
          className="table-node__name schema-creator-node__field"
          value={table.name}
          aria-label={t('schemaCreator.tableName')}
          onChange={(e) => data.onRenameTable(table.name, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          className="schema-creator-node__icon-btn"
          aria-label={t('schemaCreator.deleteTable')}
          onClick={() => data.onDeleteTable(table.name)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </header>
      <ul>
        {table.columns.map((col: ColumnModel) => {
          const isPk = col.isPrimaryKey || table.primaryKey.includes(col.name);
          const isFk = table.foreignKeys.some((fk) => fk.column === col.name);
          return (
            <li key={col.name} className={[isPk ? 'pk' : '', isFk ? 'fk' : ''].filter(Boolean).join(' ')}>
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.name}-in`}
                className="column-handle column-handle--in"
                title={t('schemaCreator.connectFkTarget')}
              />
              <label className="schema-creator-node__pk" title={t('schemaCreator.primaryKey')}>
                <input
                  type="checkbox"
                  checked={isPk}
                  aria-label={`${t('schemaCreator.primaryKey')} ${col.name}`}
                  onChange={() => data.onTogglePk(table.name, col.name)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <span>PK</span>
              </label>
              <input
                className="column-name schema-creator-node__field"
                value={col.name}
                aria-label={t('schemaCreator.columnName')}
                onChange={(e) => data.onRenameColumn(table.name, col.name, e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <select
                className="column-type schema-creator-node__field"
                value={col.sqlType}
                aria-label={t('schemaCreator.columnType')}
                onChange={(e) => data.onChangeColumnType(table.name, col.name, e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {typeOptions(col.sqlType).map((sqlType) => (
                  <option key={sqlType} value={sqlType}>
                    {sqlType}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="schema-creator-node__icon-btn"
                aria-label={t('schemaCreator.deleteColumn')}
                disabled={table.columns.length <= 1}
                onClick={() => data.onDeleteColumn(table.name, col.name)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                ×
              </button>
              <Handle
                type="source"
                position={Position.Right}
                id={`${col.name}-out`}
                className="column-handle column-handle--out"
                title={t('schemaCreator.connectFkSource')}
              />
            </li>
          );
        })}
      </ul>
      <footer className="schema-creator-node__footer">
        <button
          type="button"
          className="schema-creator-node__add-col"
          onClick={() => data.onAddColumn(table.name)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {t('schemaCreator.addColumn')}
        </button>
      </footer>
    </div>
  );
}

export const SchemaCreatorTableNode = memo(SchemaCreatorTableNodeComponent);
