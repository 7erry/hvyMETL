/**
 * Supported SQL dialects for DDL paste import in Migration Studio.
 * Only SQLite has a live file adapter; others use the shared DDL parser.
 */

export type DialectDefinition = {
  id: string;
  label: string;
  live: boolean;
};

export const DIALECTS: DialectDefinition[] = [
  { id: 'sqlite', label: 'SQLite', live: true },
  { id: 'postgresql', label: 'PostgreSQL', live: false },
  { id: 'mysql', label: 'MySQL', live: false },
  { id: 'mssql', label: 'Microsoft SQL Server', live: false },
  { id: 'clickhouse', label: 'ClickHouse', live: false },
  { id: 'oracle', label: 'Oracle', live: false },
  { id: 'db2', label: 'IBM Db2', live: false },
  { id: 'cockroachdb', label: 'CockroachDB', live: false },
  { id: 'aurora-postgresql', label: 'Amazon Aurora (PostgreSQL)', live: false },
  { id: 'aurora-mysql', label: 'Amazon Aurora (MySQL)', live: false },
  { id: 'spanner', label: 'Google Cloud Spanner', live: false },
];

/** Resolve a dialect id to its display label, or the id when unknown. */
export function getDialectLabel(id: string): string {
  return DIALECTS.find((d) => d.id === id)?.label ?? id;
}

/** True when the dialect supports live database file upload (not DDL paste only). */
export function isLiveSourceDialect(dialectId: string): boolean {
  return DIALECTS.find((d) => d.id === dialectId)?.live === true;
}

/**
 * Infer schema dialect from session state and the structural model source label.
 * SQLite uploads set `source` to a file path; DDL imports use `ddl:{dialect}`.
 */
export function inferSchemaDialect(
  model: { source: string } | null | undefined,
  sessionDialect: string,
): string {
  if (sessionDialect) return sessionDialect;
  const source = model?.source ?? '';
  if (source.startsWith('ddl:')) return source.slice(4);
  if (/\.(db|sqlite|sqlite3)$/i.test(source) || source.includes('web-uploads')) return 'sqlite';
  return 'postgresql';
}

/** Whether ETL row extraction uses CSV exports (all schema import dialects). */
export function pipelineUsesCsvExports(_schemaDialect: string): boolean {
  return true;
}

/** User-facing note for CSV data source in the pipeline dialog. */
export function getCsvSourceHint(schemaDialect: string): string {
  const label = getDialectLabel(schemaDialect);
  return `Export row data from ${label} as CSV files (one file per table, named after the table or collection).`;
}
