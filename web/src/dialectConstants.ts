import type { Dialect } from './types';

/** Sort dialect options A→Z by display label for UI selectors. */
export function sortDialectsByLabel(dialects: readonly Dialect[]): Dialect[] {
  return [...dialects].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

const UNSORTED_FALLBACK_DIALECTS: Dialect[] = [
  { id: 'sqlite', label: 'SQLite', live: true },
  { id: 'postgresql', label: 'PostgreSQL', live: true },
  { id: 'mysql', label: 'MySQL', live: true },
  { id: 'mariadb', label: 'MariaDB', live: true },
  { id: 'mssql', label: 'Microsoft SQL Server', live: true },
  { id: 'sybase', label: 'SAP ASE (Sybase)', live: false },
  { id: 'clickhouse', label: 'ClickHouse', live: false },
  { id: 'oracle', label: 'Oracle', live: false },
  { id: 'db2', label: 'IBM Db2', live: false },
  { id: 'cockroachdb', label: 'CockroachDB', live: true },
  { id: 'yugabyte', label: 'YugabyteDB', live: true },
  { id: 'aurora-postgresql', label: 'Amazon Aurora (PostgreSQL)', live: true },
  { id: 'aurora-mysql', label: 'Amazon Aurora (MySQL)', live: true },
  { id: 'redshift', label: 'Amazon Redshift', live: true },
  { id: 'snowflake', label: 'Snowflake', live: false },
  { id: 'bigquery', label: 'Google BigQuery', live: false },
  { id: 'spanner', label: 'Google Cloud Spanner', live: false },
  { id: 'databricks', label: 'Databricks SQL / Spark SQL', live: false },
  { id: 'dynamodb', label: 'Amazon DynamoDB (CloudFormation)', live: false },
  { id: 'json-schema', label: 'JSON Schema', live: false },
  { id: 'mongodb-json', label: 'MongoDB JSON', live: false },
  { id: 'singlestore', label: 'SingleStore (MemSQL)', live: false },
  { id: 'sap-hana', label: 'SAP HANA', live: false },
  { id: 'teradata', label: 'Teradata', live: false },
  { id: 'firebird', label: 'Firebird', live: false },
];

/** Offline fallback when GET /api/dialects fails (mirrors src/dialects.ts). */
export const FALLBACK_DIALECTS: Dialect[] = sortDialectsByLabel(UNSORTED_FALLBACK_DIALECTS);
