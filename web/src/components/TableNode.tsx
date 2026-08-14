import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TableModel } from '../types';
import { SQL_COLUMN_GLYPH } from '../fieldTagIcons';
import {
  dynamoTableCapabilityChips,
  dynamoTableSections,
  formatDynamoKeyRole,
} from '../dynamoTableDisplay';

import type { GuardrailIssue } from '../copilot/types';

export type TableNodeData = {
  table: TableModel;
  selected?: boolean;
  highlighted?: boolean;
  related?: boolean;
  dimmed?: boolean;
  fkColumns: string[];
  referencedColumns: string[];
  guardrailBadge?: GuardrailIssue;
  onGuardrailClick?: (issue: GuardrailIssue) => void;
};

function DynamoDbTableBody({ table }: { table: TableModel }) {
  const sections = dynamoTableSections(table);
  const chips = dynamoTableCapabilityChips(table);
  const meta = table.dynamoDb;

  return (
    <>
      {meta?.physicalTableName && meta.physicalTableName !== table.name ? (
        <p className="dynamo-table-node__physical-name">Table: {meta.physicalTableName}</p>
      ) : null}
      {chips.length > 0 ? (
        <ul className="dynamo-table-node__chips" aria-label="DynamoDB capabilities">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      ) : null}
      {sections.map((section) => (
        <section key={section.id} className="dynamo-table-node__section">
          <h3 className="dynamo-table-node__section-title">{section.title}</h3>
          {section.subtitle ? <p className="dynamo-table-node__section-subtitle">{section.subtitle}</p> : null}
          <ul>
            {section.columns.map((col) => (
              <li key={`${section.id}-${col.name}`} className="dynamo-key-row">
                <span className="column-name">{col.name}</span>
                <span className="column-type">{col.sqlType}</span>
                <span className="dynamo-role">{formatDynamoKeyRole(col)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function TableNodeComponent({ data }: NodeProps & { data: TableNodeData }) {
  const {
    table,
    selected,
    highlighted,
    related,
    dimmed,
    fkColumns,
    referencedColumns,
    guardrailBadge,
    onGuardrailClick,
  } = data;
  const fkSet = new Set(fkColumns);
  const refSet = new Set(referencedColumns);
  const isDynamoDb = Boolean(table.dynamoDb);
  const headerLabel = table.dynamoDb?.logicalId ?? table.name;

  return (
    <div
      className={[
        'table-node',
        isDynamoDb ? 'table-node--dynamodb' : '',
        selected ? 'selected' : '',
        highlighted ? 'highlighted' : '',
        related && !selected ? 'related' : '',
        dimmed ? 'dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header>
        <span className="table-node__name">{headerLabel}</span>
        {guardrailBadge ? (
          <button
            type="button"
            className={`table-node__guardrail table-node__guardrail--${guardrailBadge.severity}`}
            onClick={(e) => {
              e.stopPropagation();
              onGuardrailClick?.(guardrailBadge);
            }}
            title={guardrailBadge.detail}
          >
            ⚠ {guardrailBadge.label}
          </button>
        ) : null}
      </header>
      {isDynamoDb ? (
        <DynamoDbTableBody table={table} />
      ) : (
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
      )}
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
