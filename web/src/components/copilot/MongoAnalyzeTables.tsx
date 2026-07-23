import {
  readMongoAggregateRows,
  readMongoCompareRows,
  readMongoExplainView,
  type MongoCompareRow,
} from '../../copilot/mongoAnalyzeFormat';

type MongoAnalyzeAggregateTableProps = {
  database: string;
  collection: string;
  data: unknown;
};

export function MongoAnalyzeAggregateTable({ database, collection, data }: MongoAnalyzeAggregateTableProps) {
  const { count, rows, columns } = readMongoAggregateRows(data);
  if (rows.length === 0) {
    return <p className="mongo-analyze__empty">No aggregation results returned.</p>;
  }

  return (
    <div className="mongo-analyze">
      <p className="mongo-analyze__caption">
        {count.toLocaleString()} result(s) from <code>{database}.{collection}</code>
      </p>
      <div className="mongo-inspect-table__wrap">
        <table className="mongo-inspect-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${index}-${columns.map((column) => row[column] ?? '').join('|')}`}>
                {columns.map((column) => (
                  <td key={column}>{row[column] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MongoAnalyzeExplainTableProps = {
  data: unknown;
};

export function MongoAnalyzeExplainTable({ data }: MongoAnalyzeExplainTableProps) {
  const explain = readMongoExplainView(data);
  if (!explain) return null;

  const rows = [
    ['Method', explain.method],
    ['Verbosity', explain.verbosity],
    ['Winning stage', explain.winningStage ?? '—'],
    ['Index', explain.indexName ?? '—'],
    ['Docs examined', explain.docsExamined?.toLocaleString() ?? '—'],
    ['Docs returned', explain.docsReturned?.toLocaleString() ?? '—'],
    ['Execution ms', explain.executionTimeMillis?.toLocaleString() ?? '—'],
  ];

  return (
    <div className="mongo-analyze">
      <div className="mongo-inspect-table__wrap">
        <table className="mongo-inspect-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(status: MongoCompareRow['status']): string {
  if (status === 'match') return 'Match';
  if (status === 'missing') return 'Missing';
  if (status === 'extra') return 'Extra';
  return 'Warn';
}

type MongoAnalyzeCompareTableProps = {
  data: unknown;
};

export function MongoAnalyzeCompareTable({ data }: MongoAnalyzeCompareTableProps) {
  const { database, collection, rows, summary } = readMongoCompareRows(data);
  if (rows.length === 0) return null;

  return (
    <div className="mongo-analyze">
      <p className="mongo-analyze__caption">
        Plan comparison for <code>{database}.{collection}</code>
        {summary
          ? ` — ${summary.matches} match, ${summary.missing} missing, ${summary.extra} extra`
          : null}
      </p>
      <div className="mongo-inspect-table__wrap">
        <table className="mongo-inspect-table">
          <thead>
            <tr>
              <th>Aspect</th>
              <th>Status</th>
              <th>Planned</th>
              <th>Live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.aspect}-${row.status}-${row.planned}-${row.live}`} className={`mongo-analyze__row--${row.status}`}>
                <td>{row.aspect}</td>
                <td>{statusLabel(row.status)}</td>
                <td>{row.planned}</td>
                <td>{row.live}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
