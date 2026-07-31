import { useEffect, useMemo, useState } from 'react';
import { readMongoFindRows } from '../../copilot/mongoAnalyzeFormat';
import {
  formatInspectBytes,
  formatInspectCount,
  formatInspectIndexKey,
  formatInspectStorageSize,
  type MongoInspectCollectionRow,
  type MongoInspectDatabaseRow,
  type MongoInspectIndexSummary,
  type MongoInspectSchemaSummary,
} from '../../copilot/mongoInspectFormat';
import { CopilotCollapsibleResults, ScrollableInspectTable } from './CopilotCollapsibleResults';
import { MongoAutoEmbedVectorIndexActions } from './MongoAutoEmbedVectorIndexModal';
import { MongoAtlasSearchIndexActions } from './MongoAtlasSearchIndexModal';
import { inferTextFieldPathsFromSchemaTypes } from '../../copilot/mongoVectorAutoEmbedFields';

const FIND_PAGE_SIZE = 10;

type MongoInspectDatabaseTableProps = {
  databases: MongoInspectDatabaseRow[];
};

type MongoInspectCollectionTableProps = {
  database: string;
  collections: MongoInspectCollectionRow[];
};

function formatRowRange(start: number, end: number, total: number): string {
  if (total === 0) return 'No rows';
  if (start === end) return `Row ${start} of ${total.toLocaleString()}`;
  return `Rows ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
}

type InspectResultsPaginationProps = {
  page: number;
  pageSize: number;
  rowCount: number;
  onPageChange: (page: number) => void;
};

/** Previous/next controls for paginated inspect result tables. */
function InspectResultsPagination({ page, pageSize, rowCount, onPageChange }: InspectResultsPaginationProps) {
  if (rowCount <= pageSize) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const rangeStart = safePage * pageSize + 1;
  const rangeEnd = Math.min(rowCount, (safePage + 1) * pageSize);

  return (
    <div className="copilot-results-pagination" role="navigation" aria-label="Find results pages">
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

/** Tabular summary for logical MongoDB databases returned by inspect tools. */
export function MongoInspectDatabaseTable({ databases }: MongoInspectDatabaseTableProps) {
  if (!databases.length) return null;

  const countLabel = databases.length === 1 ? '1 database' : `${databases.length.toLocaleString()} databases`;

  return (
    <CopilotCollapsibleResults summary={`Databases — ${countLabel}`}>
      <div className="copilot-inspect-table-wrap">
        <table className="copilot-inspect-table">
          <thead>
            <tr>
              <th scope="col">Database</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {databases.map((database) => (
              <tr key={database.name}>
                <td>
                  <code>{database.name}</code>
                </td>
                <td>{formatInspectBytes(database.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CopilotCollapsibleResults>
  );
}

/** Tabular summary for collections in one logical MongoDB database. */
export function MongoInspectCollectionTable({ database, collections }: MongoInspectCollectionTableProps) {
  if (!collections.length) return null;

  const countLabel =
    collections.length === 1 ? '1 collection' : `${collections.length.toLocaleString()} collections`;

  return (
    <CopilotCollapsibleResults summary={`Collections in ${database} — ${countLabel}`}>
      <div className="copilot-inspect-table-wrap">
        <table className="copilot-inspect-table">
          <caption className="copilot-inspect-table__caption">Collections in {database}</caption>
          <thead>
            <tr>
              <th scope="col">Collection</th>
              <th scope="col">Documents</th>
              <th scope="col">Size</th>
              <th scope="col">Indexes</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((collection) => (
              <tr key={collection.name}>
                <td>
                  <code>{collection.name}</code>
                </td>
                <td>{formatInspectCount(collection.documentCount)}</td>
                <td>{formatInspectStorageSize(collection.storageSize, collection.storageSizeUnits)}</td>
                <td>{formatInspectCount(collection.indexCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CopilotCollapsibleResults>
  );
}

type MongoInspectIndexTableProps = {
  summary: MongoInspectIndexSummary;
  vectorIndexEnabled?: boolean;
  textFieldPaths?: string[];
};

/** Tabular summary for classic and Atlas Search indexes on one collection. */
export function MongoInspectIndexTable({
  summary,
  vectorIndexEnabled = false,
  textFieldPaths,
}: MongoInspectIndexTableProps) {
  const rows = [
    ...summary.classicIndexes.map((index) => ({
      key: `classic:${index.name}`,
      kind: 'Classic',
      name: index.name,
      detail: formatInspectIndexKey(index.key),
      status: '—',
    })),
    ...summary.searchIndexes.map((index) => ({
      key: `search:${index.name}`,
      kind: 'Search',
      name: index.name,
      detail: index.type,
      status: index.queryable ? `${index.status} (queryable)` : index.status,
    })),
  ];

  const target = `${summary.database}.${summary.collection}`;
  const countLabel = summary.totalCount === 1 ? '1 index' : `${summary.totalCount.toLocaleString()} indexes`;

  if (!rows.length) {
    return (
      <CopilotCollapsibleResults summary={`Indexes on ${target} — none`}>
        <p className="copilot-inspect-table__empty">
          No indexes found on <code>{summary.collection}</code> in <code>{summary.database}</code>.
        </p>
        <MongoAutoEmbedVectorIndexActions
          database={summary.database}
          collection={summary.collection}
          textFieldPaths={textFieldPaths}
          vectorIndexEnabled={vectorIndexEnabled}
        />
        <MongoAtlasSearchIndexActions
          database={summary.database}
          collection={summary.collection}
          textFieldPaths={textFieldPaths}
          searchIndexEnabled={vectorIndexEnabled}
        />
      </CopilotCollapsibleResults>
    );
  }

  return (
    <CopilotCollapsibleResults summary={`Indexes on ${target} — ${countLabel}`}>
      <MongoAutoEmbedVectorIndexActions
        database={summary.database}
        collection={summary.collection}
        textFieldPaths={textFieldPaths}
        vectorIndexEnabled={vectorIndexEnabled}
      />
      <MongoAtlasSearchIndexActions
        database={summary.database}
        collection={summary.collection}
        textFieldPaths={textFieldPaths}
        searchIndexEnabled={vectorIndexEnabled}
      />
      <div className="copilot-inspect-table-wrap">
        <table className="copilot-inspect-table">
          <caption className="copilot-inspect-table__caption">Indexes on {target}</caption>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Name</th>
              <th scope="col">Key / type</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.kind}</td>
                <td>
                  <code>{row.name}</code>
                </td>
                <td>{row.detail}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CopilotCollapsibleResults>
  );
}

type MongoInspectSchemaTableProps = {
  summary: MongoInspectSchemaSummary;
  vectorIndexEnabled?: boolean;
};

/** Tabular summary for inferred fields on one MongoDB collection. */
export function MongoInspectSchemaTable({
  summary,
  vectorIndexEnabled = false,
}: MongoInspectSchemaTableProps) {
  const target = `${summary.database}.${summary.collection}`;
  const fieldLabel =
    summary.fieldsCount === 1 ? '1 field' : `${summary.fieldsCount.toLocaleString()} fields`;

  const schemaFieldsKey = summary.fields.map((field) => `${field.path}:${field.types}`).join('|');
  const textFieldPaths = useMemo(
    () => inferTextFieldPathsFromSchemaTypes(summary.fields),
    [schemaFieldsKey],
  );

  if (!summary.fields.length) {
    return (
      <CopilotCollapsibleResults summary={`Schema for ${target} — none inferred`}>
        <p className="copilot-inspect-table__empty">
          No inferred fields found on <code>{summary.collection}</code> in <code>{summary.database}</code>.
        </p>
        <MongoAutoEmbedVectorIndexActions
          database={summary.database}
          collection={summary.collection}
          vectorIndexEnabled={vectorIndexEnabled}
        />
        <MongoAtlasSearchIndexActions
          database={summary.database}
          collection={summary.collection}
          searchIndexEnabled={vectorIndexEnabled}
        />
      </CopilotCollapsibleResults>
    );
  }

  return (
    <CopilotCollapsibleResults summary={`Schema for ${target} — ${fieldLabel}`}>
      <MongoAutoEmbedVectorIndexActions
        database={summary.database}
        collection={summary.collection}
        textFieldPaths={textFieldPaths}
        vectorIndexEnabled={vectorIndexEnabled}
      />
      <MongoAtlasSearchIndexActions
        database={summary.database}
        collection={summary.collection}
        textFieldPaths={textFieldPaths}
        searchIndexEnabled={vectorIndexEnabled}
      />
      <div className="copilot-inspect-table-wrap">
        <table className="copilot-inspect-table">
          <caption className="copilot-inspect-table__caption">
            Inferred schema for {target} ({summary.fieldsCount.toLocaleString()} field
            {summary.fieldsCount === 1 ? '' : 's'})
          </caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">BSON type</th>
            </tr>
          </thead>
          <tbody>
            {summary.fields.map((field) => (
              <tr key={field.path}>
                <td>
                  <code>{field.path}</code>
                </td>
                <td>{field.types}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CopilotCollapsibleResults>
  );
}

type MongoInspectFindTableProps = {
  data: unknown;
  defaultOpen?: boolean;
};

/** Tabular preview for find query documents returned by inspect tools. */
export function MongoInspectFindTable({ data, defaultOpen = true }: MongoInspectFindTableProps) {
  const { database, collection, totalCount, returnedCount, rows, columns, previewTruncated, hasMoreThanReturned } =
    readMongoFindRows(data);
  const [page, setPage] = useState(0);
  const target = `${database}.${collection}`;

  useEffect(() => {
    setPage(0);
  }, [data, totalCount, returnedCount]);

  const totalPages = Math.max(1, Math.ceil(rows.length / FIND_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(() => {
    const start = safePage * FIND_PAGE_SIZE;
    return rows.slice(start, start + FIND_PAGE_SIZE);
  }, [rows, safePage]);

  const summaryLabel =
    totalCount === returnedCount
      ? `Find results — ${totalCount.toLocaleString()} document${totalCount === 1 ? '' : 's'}`
      : `Find results — ${totalCount.toLocaleString()} matched (${returnedCount.toLocaleString()} returned)`;

  if (rows.length === 0) {
    if (totalCount > 0) {
      return (
        <CopilotCollapsibleResults defaultOpen={defaultOpen} summary={summaryLabel}>
          <p className="copilot-results__meta">
            Target <code>{target}</code>
            {previewTruncated
              ? ' — preview omitted because documents exceeded Atlas inspect byte limits. Narrow the filter or add a projection, then run again.'
              : '.'}
          </p>
        </CopilotCollapsibleResults>
      );
    }
    return (
      <CopilotCollapsibleResults defaultOpen={defaultOpen} summary={`Find results — no documents`}>
        <p className="copilot-inspect-table__empty">No documents matched the find query.</p>
      </CopilotCollapsibleResults>
    );
  }

  const rangeStart = safePage * FIND_PAGE_SIZE + 1;
  const rangeEnd = Math.min(rows.length, (safePage + 1) * FIND_PAGE_SIZE);
  const tableCaption = hasMoreThanReturned
    ? `${formatRowRange(rangeStart, rangeEnd, rows.length)} returned · ${totalCount.toLocaleString()} total matched`
    : formatRowRange(rangeStart, rangeEnd, rows.length);

  return (
    <CopilotCollapsibleResults defaultOpen={defaultOpen} summary={summaryLabel}>
      <p className="copilot-results__meta">
        <code>{target}</code>
        {columns.length > 0 ? ` · ${columns.length} column${columns.length === 1 ? '' : 's'}` : null}
        {' · '}
        {totalCount.toLocaleString()} total
        {hasMoreThanReturned ? ` · ${returnedCount.toLocaleString()} returned in preview` : null}
      </p>
      <ScrollableInspectTable
        caption={tableCaption}
        columns={columns}
        rows={pageRows}
        rowKey={(row, index) => `${safePage}-${index}-${columns.map((column) => row[column] ?? '').join('|')}`}
      />
      <InspectResultsPagination
        page={safePage}
        pageSize={FIND_PAGE_SIZE}
        rowCount={rows.length}
        onPageChange={setPage}
      />
      {hasMoreThanReturned ? (
        <p className="copilot-results__meta copilot-results__meta--warn">
          {totalCount.toLocaleString()} documents matched — only {returnedCount.toLocaleString()} fit in the inspect
          preview. Tighten the filter or add a projection to browse specific rows.
        </p>
      ) : null}
      {previewTruncated ? (
        <p className="copilot-results__meta copilot-results__meta--warn">
          Document previews were omitted because results exceeded Atlas inspect byte limits.
        </p>
      ) : null}
    </CopilotCollapsibleResults>
  );
}
