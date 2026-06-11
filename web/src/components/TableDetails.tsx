import type { TableModel } from '../types';

export type IncomingReference = {
  fromTable: string;
  column: string;
  referencesColumn: string;
};

type TableDetailsProps = {
  table: TableModel | null;
  incoming?: IncomingReference[];
  onClose: () => void;
  onDuplicate: (name: string) => void;
  onDelete: (name: string) => void;
};

export function TableDetails({ table, incoming = [], onClose, onDuplicate, onDelete }: TableDetailsProps) {
  if (!table) return null;

  return (
    <div className="panel table-details">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>{table.name}</h3>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button type="button" className="ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => onDuplicate(table.name)} title="Duplicate table">
            ⧉ Duplicate
          </button>
          <button
            type="button"
            className="ghost danger"
            style={{ padding: '0.25rem 0.5rem' }}
            onClick={() => onDelete(table.name)}
            title="Delete table"
          >
            ✕ Delete
          </button>
          <button type="button" className="ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose} aria-label="Close details">
            ✕
          </button>
        </div>
      </div>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', opacity: 0.85 }}>
        {table.rowCount > 0 ? `${table.rowCount.toLocaleString()} rows` : 'Row count unknown'}
        {table.primaryKey.length > 0 && ` · PK: ${table.primaryKey.join(', ')}`}
      </p>

      <table className="details-table">
        <thead>
          <tr>
            <th>Column</th>
            <th>SQL type</th>
            <th>BSON</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {table.columns.map((col) => (
            <tr key={col.name}>
              <td className={col.isPrimaryKey || table.primaryKey.includes(col.name) ? 'pk' : ''}>{col.name}</td>
              <td>{col.sqlType}</td>
              <td>{col.bsonType}</td>
              <td>
                {col.isPrimaryKey || table.primaryKey.includes(col.name) ? 'PK ' : ''}
                {!col.nullable ? 'NOT NULL' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {table.foreignKeys.length > 0 && (
        <>
          <h4 className="table-details__section">Outgoing (this table references)</h4>
          <ul className="table-details__rels">
            {table.foreignKeys.map((fk) => (
              <li key={`out-${fk.column}-${fk.referencesTable}`}>
                <code>{fk.column}</code>
                <span className="rel-arrow">→</span>
                <code>{fk.referencesTable}.{fk.referencesColumn}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      {incoming.length > 0 && (
        <>
          <h4 className="table-details__section">Incoming (referenced by)</h4>
          <ul className="table-details__rels">
            {incoming.map((ref) => (
              <li key={`in-${ref.fromTable}-${ref.column}`}>
                <code>{ref.fromTable}.{ref.column}</code>
                <span className="rel-arrow">→</span>
                <code>{table.name}.{ref.referencesColumn}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
