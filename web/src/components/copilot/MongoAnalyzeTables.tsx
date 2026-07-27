import {
  readMongoAggregateRows,
  readMongoCompareRows,
  readMongoExplainView,
  type MongoCompareRow,
} from '../../copilot/mongoAnalyzeFormat';
import { CopilotCollapsibleResults, ScrollableInspectTable } from './CopilotCollapsibleResults';

type AnalyzeVariant = 'inline' | 'panel';

type MongoAnalyzeAggregateTableProps = {
  database: string;
  collection: string;
  data: unknown;
  defaultOpen?: boolean;
  variant?: AnalyzeVariant;
};

export function MongoAnalyzeAggregateTable({
  database,
  collection,
  data,
  defaultOpen = true,
  variant = 'inline',
}: MongoAnalyzeAggregateTableProps) {
  const { count, rows, columns, appliedLimits, previewTruncated } = readMongoAggregateRows(data);
  const target = `${database}.${collection}`;
  const panelClass = variant === 'panel' ? 'copilot-results--panel' : undefined;

  if (rows.length === 0) {
    if (count > 0) {
      return (
        <CopilotCollapsibleResults
          defaultOpen={defaultOpen}
          className={panelClass}
          summary={
            <>
              Aggregation results — {count.toLocaleString()} document{count === 1 ? '' : 's'} matched
            </>
          }
        >
          <p className="copilot-results__meta">
            Target <code>{target}</code>
            {previewTruncated
              ? ' — preview omitted because the first result exceeded Atlas inspect byte limits. Add a $project stage or lower payload size, then run again.'
              : '.'}
          </p>
          {appliedLimits.length > 0 ? (
            <p className="copilot-results__meta">Applied limits: {appliedLimits.join(', ')}</p>
          ) : null}
        </CopilotCollapsibleResults>
      );
    }
    return <p className="copilot-inspect-table__empty">No aggregation results returned.</p>;
  }

  const showing = rows.length;
  const summaryLabel =
    count > showing
      ? `Aggregation results — showing ${showing} of ${count.toLocaleString()}`
      : `Aggregation results — ${count.toLocaleString()} row${count === 1 ? '' : 's'}`;

  return (
    <CopilotCollapsibleResults defaultOpen={defaultOpen} className={panelClass} summary={summaryLabel}>
      <p className="copilot-results__meta">
        <code>{target}</code>
        {columns.length > 0 ? ` · ${columns.length} column${columns.length === 1 ? '' : 's'}` : null}
      </p>
      <ScrollableInspectTable
        scrollVariant={variant}
        caption={
          count > showing
            ? `Previewing ${showing} of ${count.toLocaleString()} documents`
            : undefined
        }
        columns={columns}
        rows={rows}
        rowKey={(row, index) => `${index}-${columns.map((column) => row[column] ?? '').join('|')}`}
      />
      {previewTruncated ? (
        <p className="copilot-results__meta copilot-results__meta--warn">
          Additional rows may exist — response was truncated by Atlas inspect limits.
        </p>
      ) : null}
      {appliedLimits.length > 0 ? (
        <p className="copilot-results__meta">Applied limits: {appliedLimits.join(', ')}</p>
      ) : null}
    </CopilotCollapsibleResults>
  );
}

type MongoAnalyzeExplainTableProps = {
  data: unknown;
  defaultOpen?: boolean;
  variant?: AnalyzeVariant;
};

export function MongoAnalyzeExplainTable({
  data,
  defaultOpen = true,
  variant = 'inline',
}: MongoAnalyzeExplainTableProps) {
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

  const summary = explain.indexName
    ? `Explain plan — ${explain.winningStage ?? explain.method} on ${explain.indexName}`
    : `Explain plan — ${explain.method}`;

  return (
    <CopilotCollapsibleResults
      defaultOpen={defaultOpen}
      className={variant === 'panel' ? 'copilot-results--panel' : undefined}
      summary={summary}
    >
      <div
        className={
          variant === 'panel'
            ? 'copilot-inspect-table-wrap copilot-inspect-table-wrap--scroll copilot-inspect-table-wrap--panel'
            : 'copilot-inspect-table-wrap copilot-inspect-table-wrap--scroll'
        }
      >
        <table className="copilot-inspect-table copilot-inspect-table--kv">
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
    </CopilotCollapsibleResults>
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
  defaultOpen?: boolean;
  variant?: AnalyzeVariant;
};

export function MongoAnalyzeCompareTable({
  data,
  defaultOpen = true,
  variant = 'inline',
}: MongoAnalyzeCompareTableProps) {
  const { database, collection, rows, summary } = readMongoCompareRows(data);
  if (rows.length === 0) return null;

  const compareColumns = ['Aspect', 'Status', 'Planned', 'Live'];
  const tableRows = rows.map((row) => ({
    Aspect: row.aspect,
    Status: statusLabel(row.status),
    Planned: row.planned,
    Live: row.live,
    __status: row.status,
  }));

  return (
    <CopilotCollapsibleResults
      defaultOpen={defaultOpen}
      className={variant === 'panel' ? 'copilot-results--panel' : undefined}
      summary={
        <>
          Plan comparison — {database}.{collection}
          {summary
            ? ` (${summary.matches} match, ${summary.missing} missing, ${summary.extra} extra)`
            : null}
        </>
      }
    >
      <ScrollableInspectTable
        scrollVariant={variant}
        columns={compareColumns}
        rows={tableRows}
        rowKey={(row) => `${row.Aspect}-${row.Status}-${row.Planned}-${row.Live}`}
        rowClassName={(row) => `copilot-analyze__row--${String(row.__status ?? 'warn')}`}
      />
    </CopilotCollapsibleResults>
  );
}
