# Per-dialect design-pattern examples

One **Load example** DDL (or CloudFormation) bundle per supported import dialect.
Each file demonstrates a single MongoDB design pattern from [`knowledge/`](../../knowledge/);
pattern assignments are **deterministically shuffled** (seed `20260711`) so every dialect
gets a unique pick while staying reproducible in tests.

Regenerate committed files after editing templates:

```bash
npm run generate-dialect-examples
```

Validate:

```bash
npm test -- src/examples/dialectExamples.test.ts
```

## Dialect → pattern matrix

| Dialect | Pattern | Suggested profile | File |
| --- | --- | --- | --- |
| `aurora-postgresql` | extended-reference | catalog | [`aurora-postgresql.sql`](aurora-postgresql.sql) |
| `aurora-mysql` | schema-versioning | catalog | [`aurora-mysql.sql`](aurora-mysql.sql) |
| `bigquery` | bucket | iot | [`bigquery.sql`](bigquery.sql) |
| `clickhouse` | embed | catalog | [`clickhouse.sql`](clickhouse.sql) |
| `cockroachdb` | extended-reference | catalog | [`cockroachdb.sql`](cockroachdb.sql) |
| `databricks` | reference | mobile | [`databricks.sql`](databricks.sql) |
| `db2` | polymorphic | cms | [`db2.sql`](db2.sql) |
| `dynamodb` | subset | catalog | [`dynamodb.yaml`](dynamodb.yaml) |
| `firebird` | archive | catalog | [`firebird.sql`](firebird.sql) |
| `mariadb` | embed | catalog | [`mariadb.sql`](mariadb.sql) |
| `mssql` | single-collection | mobile | [`mssql.sql`](mssql.sql) |
| `mysql` | reference | mobile | [`mysql.sql`](mysql.sql) |
| `oracle` | attribute | catalog | [`oracle.sql`](oracle.sql) |
| `postgresql` | outlier | catalog | [`postgresql.sql`](postgresql.sql) |
| `redshift` | tree | catalog | [`redshift.sql`](redshift.sql) |
| `sap-hana` | computed | ledger | [`sap-hana.sql`](sap-hana.sql) |
| `singlestore` | single-collection | mobile | [`singlestore.sql`](singlestore.sql) |
| `snowflake` | outlier | catalog | [`snowflake.sql`](snowflake.sql) |
| `spanner` | attribute | catalog | [`spanner.sql`](spanner.sql) |
| `sqlite` | subset | catalog | [`sqlite.sql`](sqlite.sql) |
| `sybase` | computed | ledger | [`sybase.sql`](sybase.sql) |
| `teradata` | archive | catalog | [`teradata.sql`](teradata.sql) |
| `yugabyte` | schema-versioning | catalog | [`yugabyte.sql`](yugabyte.sql) |

Load any row from Migration Studio **Load example** (picker label: `Dialect Demo ({dialect})`)
or paste the file into **Import DDL** with the matching dialect selected.

See also [`docs/18-sql-dialects.md`](../docs/18-sql-dialects.md) §6 and
[`src/examples/dialectPatternManifest.ts`](../src/examples/dialectPatternManifest.ts).
