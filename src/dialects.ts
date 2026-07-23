/**
 * Supported SQL dialects for DDL paste import in Migration Studio.
 * Only SQLite has a live file adapter; others use the shared DDL parser.
 */

export type DialectDefinition = {
  id: string;
  label: string;
  live: boolean;
  /** Parser compatibility family documented in 18-sql-dialects.md. */
  parserFamily: string;
};

export const DIALECTS: DialectDefinition[] = [
  { id: 'sqlite', label: 'SQLite', live: true, parserFamily: 'sqlite' },
  { id: 'postgresql', label: 'PostgreSQL', live: false, parserFamily: 'postgresql' },
  { id: 'mysql', label: 'MySQL', live: false, parserFamily: 'mysql' },
  { id: 'mariadb', label: 'MariaDB', live: false, parserFamily: 'mysql' },
  { id: 'mssql', label: 'Microsoft SQL Server', live: false, parserFamily: 'mssql' },
  { id: 'sybase', label: 'SAP ASE (Sybase)', live: false, parserFamily: 'sybase' },
  { id: 'clickhouse', label: 'ClickHouse', live: false, parserFamily: 'clickhouse' },
  { id: 'oracle', label: 'Oracle', live: false, parserFamily: 'oracle' },
  { id: 'db2', label: 'IBM Db2', live: false, parserFamily: 'db2' },
  { id: 'cockroachdb', label: 'CockroachDB', live: false, parserFamily: 'postgresql' },
  { id: 'yugabyte', label: 'YugabyteDB', live: false, parserFamily: 'postgresql' },
  { id: 'aurora-postgresql', label: 'Amazon Aurora (PostgreSQL)', live: false, parserFamily: 'postgresql' },
  { id: 'aurora-mysql', label: 'Amazon Aurora (MySQL)', live: false, parserFamily: 'mysql' },
  { id: 'redshift', label: 'Amazon Redshift', live: false, parserFamily: 'postgresql' },
  { id: 'snowflake', label: 'Snowflake', live: false, parserFamily: 'snowflake' },
  { id: 'bigquery', label: 'Google BigQuery', live: false, parserFamily: 'bigquery' },
  { id: 'spanner', label: 'Google Cloud Spanner', live: false, parserFamily: 'spanner' },
  { id: 'databricks', label: 'Databricks SQL / Spark SQL', live: false, parserFamily: 'spark' },
  { id: 'singlestore', label: 'SingleStore (MemSQL)', live: false, parserFamily: 'mysql' },
  { id: 'sap-hana', label: 'SAP HANA', live: false, parserFamily: 'hana' },
  { id: 'teradata', label: 'Teradata', live: false, parserFamily: 'teradata' },
  { id: 'firebird', label: 'Firebird', live: false, parserFamily: 'firebird' },
];

/** Canonical dialect ids for validation and tests. */
export const SUPPORTED_DIALECT_IDS = DIALECTS.map((dialect) => dialect.id);

const DIALECT_ALIASES: Record<string, string> = {
  'spark-sql': 'databricks',
  spark: 'databricks',
  memsql: 'singlestore',
  hana: 'sap-hana',
  'sap hana': 'sap-hana',
  'google-bigquery': 'bigquery',
  yugabytedb: 'yugabyte',
};

/** Normalize a dialect id or alias to a canonical supported id. */
export function normalizeDialectId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  return DIALECT_ALIASES[trimmed] ?? trimmed;
}

/** True when the dialect id (or alias) is registered for DDL import. */
export function isSupportedDialect(raw: string): boolean {
  const id = normalizeDialectId(raw);
  return SUPPORTED_DIALECT_IDS.includes(id);
}

/**
 * Resolve a dialect id for API requests; throws when unknown.
 * Falls back to `postgresql` when the client omits dialect (legacy default).
 */
export function resolveImportDialect(raw: string | undefined | null, options?: { required?: boolean }): string {
  const normalized = normalizeDialectId(String(raw ?? ''));
  if (!normalized) {
    if (options?.required) {
      throw new Error('dialect is required');
    }
    return 'postgresql';
  }
  if (!isSupportedDialect(normalized)) {
    throw new Error(
      `Unsupported dialect "${raw}". Supported: ${SUPPORTED_DIALECT_IDS.join(', ')}`,
    );
  }
  return normalized;
}

/** Resolve a dialect id to its display label, or the id when unknown. */
export function getDialectLabel(id: string): string {
  const normalized = normalizeDialectId(id);
  return DIALECTS.find((d) => d.id === normalized)?.label ?? id;
}

/** Parser family for documentation and diagnostics. */
export function getDialectParserFamily(id: string): string | undefined {
  const normalized = normalizeDialectId(id);
  return DIALECTS.find((d) => d.id === normalized)?.parserFamily;
}

/** True when the dialect supports live database file upload (not DDL paste only). */
export function isLiveSourceDialect(dialectId: string): boolean {
  const normalized = normalizeDialectId(dialectId);
  return DIALECTS.find((d) => d.id === normalized)?.live === true;
}

/**
 * Infer schema dialect from session state and the structural model source label.
 * SQLite uploads set `source` to a file path; DDL imports use `ddl:{dialect}`.
 */
export function inferSchemaDialect(
  model: { source: string } | null | undefined,
  sessionDialect: string,
): string {
  if (sessionDialect) return normalizeDialectId(sessionDialect) || sessionDialect;
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
