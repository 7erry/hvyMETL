# Per-dialect design-pattern examples

One **Load example** DDL (or CloudFormation / JSON Schema) bundle per supported import dialect.
Each file demonstrates a single MongoDB design pattern from [`knowledge/`](../../knowledge/)
using a **multi-table schema** aligned with the seeded domain examples under
[`examples/catalog`](../catalog/), [`examples/iot`](../iot/), [`examples/cms`](../cms/), and
[`examples/ledger`](../ledger/) — not toy two-table stubs.
Pattern assignments are **deterministically shuffled** (seed `20260711`) so every dialect
gets a unique pick while staying reproducible in tests.

Regenerate committed files after editing templates:

```bash
npm run generate-dialect-examples
```

Validate:

```bash
npm test -- src/examples/dialectExamples.test.ts
```

JSON Schema import is documented in [`docs/19-json-schema-import.md`](../docs/19-json-schema-import.md).
Example shapes follow [JSON Schema examples](https://json-schema.org/learn/json-schema-examples).

## Dialect → pattern matrix

| Dialect | Pattern | Suggested profile | File |
| --- | --- | --- | --- |
| `aurora-mysql` | schema-versioning | catalog | [`aurora-mysql.sql`](aurora-mysql.sql) |
| `aurora-postgresql` | tree | catalog | [`aurora-postgresql.sql`](aurora-postgresql.sql) |
| `bigquery` | computed | ledger | [`bigquery.sql`](bigquery.sql) |
| `clickhouse` | schema-versioning | catalog | [`clickhouse.sql`](clickhouse.sql) |
| `cockroachdb` | tree | catalog | [`cockroachdb.sql`](cockroachdb.sql) |
| `databricks` | archive | catalog | [`databricks.sql`](databricks.sql) |
| `db2` | extended-reference | catalog | [`db2.sql`](db2.sql) |
| `dynamodb` | bucket | iot | [`dynamodb.yaml`](dynamodb.yaml) |
| `firebird` | attribute | catalog | [`firebird.sql`](firebird.sql) |
| `json-schema` | bucket | iot | [`json-schema.json`](json-schema.json) |
| `mariadb` | single-collection | mobile | [`mariadb.sql`](mariadb.sql) |
| `mssql` | reference | mobile | [`mssql.sql`](mssql.sql) |
| `mysql` | archive | catalog | [`mysql.sql`](mysql.sql) |
| `oracle` | extended-reference | catalog | [`oracle.sql`](oracle.sql) |
| `postgresql` | attribute | catalog | [`postgresql.sql`](postgresql.sql) |
| `redshift` | polymorphic | cms | [`redshift.sql`](redshift.sql) |
| `sap-hana` | outlier | catalog | [`sap-hana.sql`](sap-hana.sql) |
| `singlestore` | subset | catalog | [`singlestore.sql`](singlestore.sql) |
| `snowflake` | embed | catalog | [`snowflake.sql`](snowflake.sql) |
| `spanner` | computed | ledger | [`spanner.sql`](spanner.sql) |
| `sqlite` | embed | catalog | [`sqlite.sql`](sqlite.sql) |
| `sybase` | subset | catalog | [`sybase.sql`](sybase.sql) |
| `teradata` | outlier | catalog | [`teradata.sql`](teradata.sql) |
| `yugabyte` | single-collection | mobile | [`yugabyte.sql`](yugabyte.sql) |

Load any row from Migration Studio **Load example** (picker label: `{Dialect} - {Profile}`, e.g. `IBM Db2 - CMS`)
or paste the file into **Import DDL** with the matching dialect selected.

See also [`docs/18-sql-dialects.md`](../docs/18-sql-dialects.md) §6 and
[`src/examples/dialectPatternManifest.ts`](../src/examples/dialectPatternManifest.ts).
