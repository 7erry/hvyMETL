import { useEffect, useMemo, useState } from 'react';
import {
  readMongoAggregateRows,
  readMongoCompareRows,
  readMongoExplainView,
  type MongoCompareRow,
} from '../../copilot/mongoAnalyzeFormat';
import { CopilotCollapsibleResults, ScrollableInspectTable } from './CopilotCollapsibleResults';

const AGGREGATE_PAGE_SIZE = 10;

type AnalyzeVariant = 'inline' | 'panel';

function formatRowRange(start: number, end: number, total: number): string {
  if (total === 0) return 'No rows';
  if (start === end) return `Row ${start} of ${total.toLocaleString()}`;
  return `Rows ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
}

type AggregateResultsPaginationProps = {
  page: number;
  pageSize: number;
  rowCount: number;
  onPageChange: (page: number) => void;
};

/** Previous/next controls for paginated aggregate result tables. */
function AggregateResultsPagination({
  page,
  pageSize,
  rowCount,
  onPageChange,
}: AggregateResultsPaginationProps) {
  if (rowCount <= pageSize) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const rangeStart = safePage * pageSize + 1;
  const rangeEnd = Math.min(rowCount, (safePage + 1) * pageSize);

  return (
    <div className="copilot-results-pagination" role="navigation" aria-label="Aggregate results pages">
      <span className="copilot-results-pagination__range">{formatRowRange(rangeStart, rangeEnd, rowCount)}</span>
      <div className="copilot-results-pagination__controls">
        <button
          type="button"
          className="secondary copilot-results-pagination__btn"
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span className="copilot-results-pagination__page">
          Page {safePage + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="secondary copilot-results-pagination__btn"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

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
  const { totalCount, returnedCount, rows, columns, appliedLimits, previewTruncated, hasMoreThanReturned } =
    readMongoAggregateRows(data);
  const [page, setPage] = useState(0);
  const target = `${database}.${collection}`;
  const panelClass = variant === 'panel' ? 'copilot-results--panel' : undefined;

  useEffect(() => {
    setPage(0);
  }, [data, totalCount, returnedCount]);

  const totalPages = Math.max(1, Math.ceil(rows.length / AGGREGATE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(() => {
    const start = safePage * AGGREGATE_PAGE_SIZE;
    return rows.slice(start, start + AGGREGATE_PAGE_SIZE);
  }, [rows, safePage]);

  const summaryLabel =
    totalCount === returnedCount
      ? `Aggregation results — ${totalCount.toLocaleString()} total`
      : `Aggregation results — ${totalCount.toLocaleString()} total (${returnedCount.toLocaleString()} returned)`;

  if (rows.length === 0) {
    if (totalCount > 0) {
      return (
        <CopilotCollapsibleResults
          defaultOpen={defaultOpen}
          className={panelClass}
          summary={
            <>
              Aggregation results — {totalCount.toLocaleString()} total matched
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

  const rangeStart = safePage * AGGREGATE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(rows.length, (safePage + 1) * AGGREGATE_PAGE_SIZE);
  const tableCaption = hasMoreThanReturned
    ? `${formatRowRange(rangeStart, rangeEnd, rows.length)} returned · ${totalCount.toLocaleString()} total matched`
    : formatRowRange(rangeStart, rangeEnd, rows.length);

  return (
    <CopilotCollapsibleResults defaultOpen={defaultOpen} className={panelClass} summary={summaryLabel}>
      <p className="copilot-results__meta">
        <code>{target}</code>
        {columns.length > 0 ? ` · ${columns.length} column${columns.length === 1 ? '' : 's'}` : null}
        {' · '}
        {totalCount.toLocaleString()} total
        {hasMoreThanReturned ? ` · ${returnedCount.toLocaleString()} returned in preview` : null}
      </p>
      <ScrollableInspectTable
        scrollVariant={variant}
        caption={tableCaption}
        columns={columns}
        rows={pageRows}
        rowKey={(row, index) => `${safePage}-${index}-${columns.map((column) => row[column] ?? '').join('|')}`}
      />
      <AggregateResultsPagination
        page={safePage}
        pageSize={AGGREGATE_PAGE_SIZE}
        rowCount={rows.length}
        onPageChange={setPage}
      />
      {hasMoreThanReturned ? (
        <p className="copilot-results__meta copilot-results__meta--warn">
          {totalCount.toLocaleString()} documents matched — only {returnedCount.toLocaleString()} fit in the inspect
          preview. Add <code>$limit</code> or narrow with <code>$project</code> to browse specific rows.
        </p>
      ) : null}
      {previewTruncated ? (
        <p className="copilot-results__meta copilot-results__meta--warn">
          Document previews were omitted because the first result exceeded Atlas inspect byte limits.
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
