# Example domains and design-pattern coverage

This folder holds **42 built-in schemas** exposed in Migration Studio **Instant Schema Import → Load example**
(served from the repo `examples/` tree, or `~/hvymetl/examples` on hosted deployments). They fall into four groups:

| Group | Count | Purpose |
| --- | ---: | --- |
| [Seeded SQLite domains](#seeded-sqlite-domains-7) | 7 | Full workload demos with `.sql`, optional `.db` (via `seed-examples`), CSV generators, diagram JSON |
| [Enterprise & Oracle DDL](#enterprise-oracle-and-dynamodb-ddl) | 10 | PostgreSQL ledger, multi-file Oracle packs, standalone DynamoDB CloudFormation |
| [Per-dialect pattern demos](#per-dialect-pattern-demos-24) | 24 | One script per import dialect (`dialects/`), each showcasing a single design pattern |
| **Total Load example entries** | **42** | Same list as `GET /api/schema/builtin-examples` ([`listBuiltinExamples`](../src/server/builtinExamples.ts)) |

Seven seeded SQLite domains demonstrate how hvyMETL applies MongoDB schema design patterns from the [`knowledge/`](../knowledge/) base. Each
seeded domain ships DDL (`.sql`), a deterministic seeder ([`src/examples/seed.ts`](../src/examples/seed.ts)),
an optional Python CSV generator, and a Migration Studio diagram JSON.

**PostgreSQL DDL-only:** [`ledger/ledger.sql`](ledger/ledger.sql) targets the
**Financial Ledger** profile (multi-currency double-entry, partitioned journal lines).
Load it from Migration Studio **Load example** or `design --ddl-file examples/ledger/ledger.sql --profile ledger`.

Build the SQLite databases once, then run `design` with the matching workload profile to
see pattern decisions in `migration-plan.json` and the design report.

```bash
npm run seed-examples
npm run hvymetl -- design --source examples/catalog/catalog.db --profile catalog --out out/catalog
```

Full seeder and pipeline notes: **[docs/10-examples.md](../docs/10-examples.md)**.

Upload **`.sql` / `.ddl`** for paste import, **`.db`** for SQLite introspection, or pick any row below in **Load example**.

## Migration Studio Load example catalog

Alphabetical picker labels (API `exampleId` → file under `examples/`).

| Load example label | Example id | Dialect | Suggested profile |
| --- | --- | --- | --- |
| Amazon Aurora (MySQL) - Catalog | `dialects/aurora-mysql.sql` | `aurora-mysql` | `catalog` |
| Amazon Aurora (PostgreSQL) - Catalog | `dialects/aurora-postgresql.sql` | `aurora-postgresql` | `catalog` |
| Amazon DynamoDB (CloudFormation) - IoT | `dialects/dynamodb.yaml` | `dynamodb` | `iot` |
| Amazon Redshift - CMS | `dialects/redshift.sql` | `redshift` | `cms` |
| ClickHouse - Catalog | `dialects/clickhouse.sql` | `clickhouse` | `catalog` |
| CockroachDB - Catalog | `dialects/cockroachdb.sql` | `cockroachdb` | `catalog` |
| Content Management (CMS) | `cms` | `sqlite` | `cms` |
| Databricks SQL / Spark SQL - Catalog | `dialects/databricks.sql` | `databricks` | `catalog` |
| Amazon DynamoDB (CloudFormation) - CMS Platform | `dynamodb/cms-platform-table.yaml` | `dynamodb` | `cms` |
| Amazon DynamoDB (CloudFormation) - Ecommerce Catalog | `dynamodb/ecommerce-catalog-table.yaml` | `dynamodb` | `catalog` |
| Amazon DynamoDB (CloudFormation) - Orders | `dynamodb/orders-table.yaml` | `dynamodb` | — |
| E-commerce Catalog | `catalog` | `sqlite` | `catalog` |
| Financial Ledger (Enterprise) | `ledger` | `postgresql` | `ledger` |
| Firebird - Catalog | `dialects/firebird.sql` | `firebird` | `catalog` |
| Google BigQuery - Ledger | `dialects/bigquery.sql` | `bigquery` | `ledger` |
| Google Cloud Spanner - Ledger | `dialects/spanner.sql` | `spanner` | `ledger` |
| IBM Db2 - Catalog | `dialects/db2.sql` | `db2` | `catalog` |
| IoT Telemetry | `iot` | `sqlite` | `iot` |
| JSON Schema - IoT | `dialects/json-schema.json` | `json-schema` | `iot` |
| MariaDB - Mobile | `dialects/mariadb.sql` | `mariadb` | `mobile` |
| Microsoft SQL Server - Mobile | `dialects/mssql.sql` | `mssql` | `mobile` |
| Mobile Backend | `mobile` | `sqlite` | `mobile` |
| MySQL - Catalog | `dialects/mysql.sql` | `mysql` | `catalog` |
| Oracle - Catalog | `dialects/oracle.sql` | `oracle` | `catalog` |
| Oracle All | `oracle/oracle-all.ddl` | `oracle` | — |
| Oracle Assetmanagement | `oracle/oracle-assetmanagement.ddl` | `oracle` | — |
| Oracle Customer Sales | `oracle/oracle-customer-sales.ddl` | `oracle` | — |
| Oracle Customerloyalty | `oracle/oracle-customerloyalty.ddl` | `oracle` | — |
| Oracle Hr | `oracle/oracle-hr.ddl` | `oracle` | — |
| Oracle Invoices | `oracle/oracle-invoices.ddl` | `oracle` | — |
| Oracle Supplychain | `oracle/oracle-supplychain.ddl` | `oracle` | — |
| Personalization Engine | `personalization` | `sqlite` | `personalization` |
| PostgreSQL - Catalog | `dialects/postgresql.sql` | `postgresql` | `catalog` |
| Real-Time Analytics | `analytics` | `sqlite` | `realtime-analytics` |
| SAP ASE (Sybase) - Catalog | `dialects/sybase.sql` | `sybase` | `catalog` |
| SAP HANA - Catalog | `dialects/sap-hana.sql` | `sap-hana` | `catalog` |
| Single View (Customer 360) | `singleview` | `sqlite` | `single-view` |
| SingleStore (MemSQL) - Catalog | `dialects/singlestore.sql` | `singlestore` | `catalog` |
| Snowflake - Catalog | `dialects/snowflake.sql` | `snowflake` | `catalog` |
| SQLite - Catalog | `dialects/sqlite.sql` | `sqlite` | `catalog` |
| Teradata - Catalog | `dialects/teradata.sql` | `teradata` | `catalog` |
| YugabyteDB - Mobile | `dialects/yugabyte.sql` | `yugabyte` | `mobile` |

### Seeded SQLite domains (7)

| Domain | SQL | Default profile | Diagram JSON | CSV generator |
| --- | --- | --- | --- | --- |
| `analytics/` | [`analytics.sql`](analytics/analytics.sql) | `realtime-analytics` | [`hvymetl-diagram-Analytics.json`](analytics/hvymetl-diagram-Analytics.json) | [`analytics_generator.py`](analytics/analytics_generator.py) |
| `catalog/` | [`catalog.sql`](catalog/catalog.sql) | `catalog` | [`hvymetl-diagram-Catalog.json`](catalog/hvymetl-diagram-Catalog.json) | [`catalog_generator.py`](catalog/catalog_generator.py) |
| `cms/` | [`cms.sql`](cms/cms.sql) | `cms` | [`hvymetl-diagram-CMS.json`](cms/hvymetl-diagram-CMS.json) | [`cms_generator.py`](cms/cms_generator.py) |
| `iot/` | [`iot.sql`](iot/iot.sql) | `iot` | [`hvymetl-diagram-IOT.json`](iot/hvymetl-diagram-IOT.json) | [`iot_generator.py`](iot/iot_generator.py) |
| `mobile/` | [`mobile.sql`](mobile/mobile.sql) | `mobile` | [`hvymetl-diagram-Mobile.json`](mobile/hvymetl-diagram-Mobile.json) | [`mobile_generator.py`](mobile/mobile_generator.py) |
| `personalization/` | [`personalization.sql`](personalization/personalization.sql) | `personalization` | [`hvymetl-diagram-Personalization.json`](personalization/hvymetl-diagram-Personalization.json) | [`personalization_generator.py`](personalization/personalization_generator.py) |
| `singleview/` | [`singleview.sql`](singleview/singleview.sql) | `single-view` | [`hvymetl-diagram-SingleView.json`](singleview/hvymetl-diagram-SingleView.json) | [`singleview_generator.py`](singleview/singleview_generator.py) |

After `npm run seed-examples`, each folder also contains a matching `.db` for `design --source examples/{domain}/{domain}.db`.

### Enterprise, Oracle, and DynamoDB DDL

| Example | File | Dialect | Notes |
| --- | --- | --- | --- |
| Financial Ledger | [`ledger/ledger.sql`](ledger/ledger.sql) | `postgresql` | Enterprise ledger; suggested profile `ledger` |
| Oracle HR | [`oracle/oracle-hr.ddl`](oracle/oracle-hr.ddl) | `oracle` | Sample Oracle pack (see all seven `.ddl` files in catalog table) |
| Oracle All | [`oracle/oracle-all.ddl`](oracle/oracle-all.ddl) | `oracle` | Combined Oracle demo schemas |
| Oracle Asset Management | [`oracle/oracle-assetmanagement.ddl`](oracle/oracle-assetmanagement.ddl) | `oracle` | |
| Oracle Customer Sales | [`oracle/oracle-customer-sales.ddl`](oracle/oracle-customer-sales.ddl) | `oracle` | |
| Oracle Customer Loyalty | [`oracle/oracle-customerloyalty.ddl`](oracle/oracle-customerloyalty.ddl) | `oracle` | |
| Oracle Invoices | [`oracle/oracle-invoices.ddl`](oracle/oracle-invoices.ddl) | `oracle` | |
| Oracle Supply Chain | [`oracle/oracle-supplychain.ddl`](oracle/oracle-supplychain.ddl) | `oracle` | |
| Amazon DynamoDB CMS platform | [`dynamodb/cms-platform-table.yaml`](dynamodb/cms-platform-table.yaml) | `dynamodb` | Single-table CMS; GSI2 moderation index — see [docs/20-dynamodb-gsi-mongodb-migration.md](../docs/20-dynamodb-gsi-mongodb-migration.md) |
| Amazon DynamoDB ecommerce catalog | [`dynamodb/ecommerce-catalog-table.yaml`](dynamodb/ecommerce-catalog-table.yaml) | `dynamodb` | Single-table catalog; suggested profile `catalog` |
| Amazon DynamoDB orders | [`dynamodb/orders-table.yaml`](dynamodb/orders-table.yaml) | `dynamodb` | CloudFormation table template |

[`oracle/hvymetl-diagram-Oracle.json`](oracle/hvymetl-diagram-Oracle.json) and [`oracle/generate_mock_data.py`](oracle/generate_mock_data.py) support diagram import and mock data; they are not separate **Load example** entries.

### Per-dialect pattern demos (24)

One file per supported import dialect under [`dialects/`](dialects/) — SQL, [`dynamodb.yaml`](dialects/dynamodb.yaml), or [`json-schema.json`](dialects/json-schema.json). Each file maps to exactly one row in the **Load example catalog** table above.

Dialect → design pattern assignments, regeneration, and validation:

- **[`dialects/README.md`](dialects/README.md)** — full dialect → pattern matrix
- **`npm run generate-dialect-examples`** — regenerate committed dialect files
- **`npm test -- src/examples/dialectExamples.test.ts`** — regression tests

See also [`docs/18-sql-dialects.md`](../docs/18-sql-dialects.md) and [`docs/19-json-schema-import.md`](../docs/19-json-schema-import.md).

## Pattern applicability matrix

The table below maps every knowledge-base topic to a runnable example. Pattern
ids match [`PatternId`](../src/types.ts) and the design engine output.

| Knowledge doc | Pattern id | Example | Profile | Where it shows up | Verify |
| --- | --- | --- | --- | --- | --- |
| [`attribute.md`](../knowledge/attribute.md) | `attribute` | `catalog` | `catalog` | EAV `product_attributes` folded into `products` | `design --source examples/catalog/catalog.db --profile catalog` |
| [`attribute.md`](../knowledge/attribute.md) | `attribute` | `personalization` | `personalization` | Sparse `profile_traits` on `profiles` | `design --source examples/personalization/personalization.db --profile personalization` |
| [`archive.md`](../knowledge/archive.md) | `archive` | `catalog` | `catalog` | Hot `reviews` + cold `reviews_archive` | same as catalog row above |
| [`bucket.md`](../knowledge/bucket.md) | `bucket` | `mobile` | `mobile` | `app_events` event stream (when time-series not preferred) | `design --source examples/mobile/mobile.db --profile mobile` |
| [`time-series.md`](../knowledge/time-series.md) | `time-series` | `iot` | `iot` | 60k-row `sensor_readings` → native time series collection | `design --source examples/iot/iot.db --profile iot` |
| [`time-series.md`](../knowledge/time-series.md) | `time-series` | `analytics` | `realtime-analytics` | `page_events` firehose | `design --source examples/analytics/analytics.db --profile realtime-analytics` |
| [`computed.md`](../knowledge/computed.md) | `computed` | `ledger` | `ledger` | `current_balance` / `cleared_balance` on `accounts` | `design --ddl-file examples/ledger/ledger.sql --profile ledger` |
| [`computed.md`](../knowledge/computed.md) | `computed` | *(all seven seeded)* | each domain’s default profile | Counter fields on parents (e.g. `totalReviews`, `count` on buckets) | any seeded `design` run |
| [`embed-vs-reference.md`](../knowledge/embed-vs-reference.md) | `embed` / `reference` | `ledger` | `ledger` | `journal_lines` embedded under `journal_entries` (line-item pattern) | ledger `design` |
| [`embed-vs-reference.md`](../knowledge/embed-vs-reference.md) | `embed` / `reference` | *(all seven seeded)* | each default profile | Bounded children embedded; unbounded or lookup paths referenced | inspect plan |
| [`extended-reference.md`](../knowledge/extended-reference.md) | `extended-reference` | `catalog` | `catalog` | `products.brand` snapshot | catalog `design` |
| [`extended-reference.md`](../knowledge/extended-reference.md) | `extended-reference` | `cms` | `cms` | `pages.author`, block → asset lookups | cms `design` |
| [`extended-reference.md`](../knowledge/extended-reference.md) | `extended-reference` | `mobile` | `mobile` | `sessions.appUser`, `userDevices.appUser` | mobile `design` |
| [`extended-reference.md`](../knowledge/extended-reference.md) | `extended-reference` | `singleview` | `single-view` | `orders.crmCustomer` fan-in | singleview `design` |
| [`outlier.md`](../knowledge/outlier.md) | `outlier` | `catalog` | `catalog` | Skewed `reviews` on hot products (`recentReviews`) | catalog `design` |
| [`outlier.md`](../knowledge/outlier.md) | `outlier` | `cms` | `cms` | Skewed `content_blocks` per `assets` | cms `design` |
| [`polymorphic.md`](../knowledge/polymorphic.md) | `polymorphic` | `cms` | `cms` | `content_blocks` (`block_type` + sparse variant columns) | cms `design` |
| [`preallocation.md`](../knowledge/preallocation.md) | *(profile hint)* | `analytics` | `realtime-analytics` | `hourly_rollups` models pre-filled dashboard slots; preferred by IoT/analytics profiles | RAG cites `preallocation.md`; rollup table shape in `analytics.sql` / seeder |
| [`schema-versioning.md`](../knowledge/schema-versioning.md) | `schema-versioning` | `ledger` (and all seeded) | `ledger` / each default | Stamped on every planned collection | ledger or any `design` run |
| [`single-collection.md`](../knowledge/single-collection.md) | `single-collection` | `cms` | **`mobile`** or **`realtime-analytics`** | Junction `page_tags` → hub `pages_tags` | `design --source examples/cms/cms.db --profile mobile` |
| [`single-collection.md`](../knowledge/single-collection.md) | `single-collection` | `personalization` | **`mobile`** or **`realtime-analytics`** | Junction `profile_segments` → hub `profiles_segments` | `design --source examples/personalization/personalization.db --profile mobile` |
| [`subset.md`](../knowledge/subset.md) | `subset` | `catalog` | `catalog` | Recent bounded `reviews` embedded on `products` | catalog `design` |
| [`subset.md`](../knowledge/subset.md) | `subset` | `cms` | `cms` | Recent blocks on `assets` | cms `design` |
| [`tree.md`](../knowledge/tree.md) | `tree` | `ledger` | `ledger` | Self-referencing `accounts.parent_account_id` (chart of accounts) | ledger `design` |
| [`tree.md`](../knowledge/tree.md) | `tree` | `catalog` | `catalog` | Self-referencing `categories` | catalog `design` |
| [`tree.md`](../knowledge/tree.md) | `tree` | `cms` | `cms` | Self-referencing `pages` | cms `design` |
| [`migration-principles.md`](../knowledge/migration-principles.md) | *(principles)* | *(all seven)* | any | Embed-over-reference, meta/EAV collapse, line-item checklist | retrieved during RAG; see [03-knowledge-rag.md](../docs/03-knowledge-rag.md) |

### Coverage at a glance (default profile)

| Database | Default profile | Automated patterns you should see |
| --- | --- | --- |
| `catalog/catalog.db` | `catalog` | attribute, archive, computed, embed, extended-reference, outlier, reference, schema-versioning, subset, tree |
| `cms/cms.db` | `cms` | computed, embed, extended-reference, outlier, polymorphic, reference, schema-versioning, subset, tree |
| `iot/iot.db` | `iot` | bucket, computed, embed, reference, schema-versioning |
| `mobile/mobile.db` | `mobile` | bucket, computed, embed, extended-reference, reference, schema-versioning |
| `personalization/personalization.db` | `personalization` | attribute, computed, embed, reference, schema-versioning |
| `analytics/analytics.db` | `realtime-analytics` | bucket, computed, embed, reference, schema-versioning |
| `singleview/singleview.db` | `single-view` | computed, embed, extended-reference, reference, schema-versioning |
| `ledger/ledger.sql` | `ledger` | computed, embed, reference, schema-versioning, tree (DDL paste; PostgreSQL) |

Run `npm test -- src/examples/examplePatternCoverage.test.ts` and
`npm test -- src/examples/ledgerExample.test.ts` to regression-check
these expectations after changing the seeder or design engine.

### Single Collection requires a junction-friendly profile

The default CMS profile prefers embed/tree over merging junction tables. To see
**Single Collection**, reuse a junction-bearing source with a profile that lists
`single-collection` (or peak RPM ≥ 100k):

```bash
npm run hvymetl -- design --source examples/cms/cms.db --profile mobile --out out/cms-single-collection
# migration-plan.json includes collection pages_tags with pattern single-collection
```

### Pre-allocation in the knowledge base vs the design engine

[`preallocation.md`](../knowledge/preallocation.md) is indexed for RAG and listed
in IoT / real-time analytics profile preferences. The analytics example’s
`hourly_rollups` table is shaped for pre-allocated hourly slots combined with
bucket/computed patterns. The design engine does **not** yet emit a distinct
`preallocation` pattern id — use the knowledge doc and rollup schema as the
reference shape when reviewing plans for write-heavy dashboards.

### Oracle & PostgreSQL DDL (no SQLite seeder)

[`ledger/ledger.sql`](ledger/ledger.sql) is PostgreSQL enterprise financial ledger DDL for the **ledger** profile (also listed above). Oracle `.ddl` packs and [`dialects/oracle.sql`](dialects/oracle.sql) are paste-import demos; they are not part of `seed-examples`.

**Per-dialect pattern demos:** [`dialects/`](dialects/) — documented in [`dialects/README.md`](dialects/README.md) and the [Load example catalog](#migration-studio-load-example-catalog) (24 dialect rows).

## Domain folders (diagrams & generators)

Same seven seeded domains as [Seeded SQLite domains (7)](#seeded-sqlite-domains-7). `ledger/` has SQL only (no diagram JSON in repo).

Import any diagram JSON in Migration Studio (see [docs/10-examples.md § Migration Studio](../docs/10-examples.md#migration-studio-diagram-exports)).

## End-to-end Atlas validation

```bash
npm run run-all-examples   # requires MONGODB_URI — see docs/11-run-all-examples.md
```
