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
