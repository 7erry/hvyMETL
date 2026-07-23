import {
  formatInspectBytes,
  formatInspectCount,
  formatInspectIndexKey,
  formatInspectStorageSize,
  type MongoInspectCollectionRow,
  type MongoInspectDatabaseRow,
  type MongoInspectIndexSummary,
} from '../../copilot/mongoInspectFormat';

type MongoInspectDatabaseTableProps = {
  databases: MongoInspectDatabaseRow[];
};

type MongoInspectCollectionTableProps = {
  database: string;
  collections: MongoInspectCollectionRow[];
};

/** Tabular summary for logical MongoDB databases returned by inspect tools. */
export function MongoInspectDatabaseTable({ databases }: MongoInspectDatabaseTableProps) {
  if (!databases.length) return null;

  return (
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
  );
}

/** Tabular summary for collections in one logical MongoDB database. */
export function MongoInspectCollectionTable({ database, collections }: MongoInspectCollectionTableProps) {
  if (!collections.length) return null;

  return (
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
  );
}

type MongoInspectIndexTableProps = {
  summary: MongoInspectIndexSummary;
};

/** Tabular summary for classic and Atlas Search indexes on one collection. */
export function MongoInspectIndexTable({ summary }: MongoInspectIndexTableProps) {
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

  if (!rows.length) {
    return (
      <p className="copilot-inspect-table__empty">
        No indexes found on <code>{summary.collection}</code> in <code>{summary.database}</code>.
      </p>
    );
  }

  return (
    <div className="copilot-inspect-table-wrap">
      <table className="copilot-inspect-table">
        <caption className="copilot-inspect-table__caption">
          Indexes on {summary.database}.{summary.collection}
        </caption>
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
  );
}
