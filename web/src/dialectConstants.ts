import type { Dialect } from './types';

/** Offline fallback when GET /api/dialects fails (mirrors src/dialects.ts). */
export const FALLBACK_DIALECTS: Dialect[] = [
  { id: 'sqlite', label: 'SQLite', live: true },
  { id: 'postgresql', label: 'PostgreSQL', live: false },
  { id: 'mysql', label: 'MySQL', live: false },
  { id: 'mariadb', label: 'MariaDB', live: false },
  { id: 'mssql', label: 'Microsoft SQL Server', live: false },
  { id: 'sybase', label: 'SAP ASE (Sybase)', live: false },
  { id: 'clickhouse', label: 'ClickHouse', live: false },
  { id: 'oracle', label: 'Oracle', live: false },
  { id: 'db2', label: 'IBM Db2', live: false },
  { id: 'cockroachdb', label: 'CockroachDB', live: false },
  { id: 'yugabyte', label: 'YugabyteDB', live: false },
  { id: 'aurora-postgresql', label: 'Amazon Aurora (PostgreSQL)', live: false },
  { id: 'aurora-mysql', label: 'Amazon Aurora (MySQL)', live: false },
  { id: 'redshift', label: 'Amazon Redshift', live: false },
  { id: 'snowflake', label: 'Snowflake', live: false },
  { id: 'bigquery', label: 'Google BigQuery', live: false },
  { id: 'spanner', label: 'Google Cloud Spanner', live: false },
  { id: 'databricks', label: 'Databricks SQL / Spark SQL', live: false },
  { id: 'singlestore', label: 'SingleStore (MemSQL)', live: false },
  { id: 'sap-hana', label: 'SAP HANA', live: false },
  { id: 'teradata', label: 'Teradata', live: false },
  { id: 'firebird', label: 'Firebird', live: false },
];
