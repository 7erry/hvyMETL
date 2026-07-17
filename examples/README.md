# Example domains and design-pattern coverage

Seven seeded SQLite domains under this folder demonstrate how hvyMETL applies
MongoDB schema design patterns from the [`knowledge/`](../knowledge/) base. Each
seeded domain ships DDL (`.sql`), a deterministic seeder ([`src/examples/seed.ts`](../src/examples/seed.ts)),
an optional Python CSV generator, and a Migration Studio diagram JSON.

**PostgreSQL DDL-only:** [`ledger/ledger.sql`](ledger/ledger.sql) targets the
**Financial Ledger** profile (multi-currency double-entry, partitioned journal lines).
Load it from Migration Studio **Load example** or `design --ddl-file examples/ledger/ledger.sql --profile ledger`.

Build the databases once, then run `design` with the matching workload profile to
see pattern decisions in `migration-plan.json` and the design report.

```bash
npm run seed-examples
npm run hvymetl -- design --source examples/catalog/catalog.db --profile catalog --out out/catalog
```

Full seeder and pipeline notes: **[docs/10-examples.md](../docs/10-examples.md)**.

## Pattern applicability matrix

The table below maps every knowledge-base topic to a runnable example. Pattern
ids match [`PatternId`](../src/types.ts) and the design engine output.

| Knowledge doc | Pattern id | Example | Profile | Where it shows up | Verify |
| --- | --- | --- | --- | --- | --- |
| [`attribute.md`](../knowledge/attribute.md) | `attribute` | `catalog` | `catalog` | EAV `product_attributes` folded into `products` | `design --source examples/catalog/catalog.db --profile catalog` |
| [`attribute.md`](../knowledge/attribute.md) | `attribute` | `personalization` | `personalization` | Sparse `profile_traits` on `profiles` | `design --source examples/personalization/personalization.db --profile personalization` |
| [`archive.md`](../knowledge/archive.md) | `archive` | `catalog` | `catalog` | Hot `reviews` + cold `reviews_archive` | same as catalog row above |
| [`bucket.md`](../knowledge/bucket.md) | `bucket` | `iot` | `iot` | 60k-row `sensor_readings` → `sensorReadings` buckets | `design --source examples/iot/iot.db --profile iot` |
| [`bucket.md`](../knowledge/bucket.md) | `bucket` | `mobile` | `mobile` | `app_events` event stream | `design --source examples/mobile/mobile.db --profile mobile` |
| [`bucket.md`](../knowledge/bucket.md) | `bucket` | `analytics` | `realtime-analytics` | `page_events` firehose | `design --source examples/analytics/analytics.db --profile realtime-analytics` |
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

### Oracle & PostgreSQL DDL (no seeder)

[`oracle/`](oracle/) provides Oracle DDL and a Migration Studio diagram for
dialect demos. [`ledger/ledger.sql`](ledger/ledger.sql) is PostgreSQL enterprise
financial ledger DDL for the **ledger** profile. Neither is part of `seed-examples`.

## Domain folders

| Folder | Diagram JSON | CSV generator |
| --- | --- | --- |
| `ledger/` | — | — |
| `analytics/` | `hvymetl-diagram-Analytics.json` | `analytics_generator.py` |
| `catalog/` | `hvymetl-diagram-Catalog.json` | `catalog_generator.py` |
| `cms/` | `hvymetl-diagram-CMS.json` | `cms_generator.py` |
| `iot/` | `hvymetl-diagram-IOT.json` | `iot_generator.py` |
| `mobile/` | `hvymetl-diagram-Mobile.json` | `mobile_generator.py` |
| `personalization/` | `hvymetl-diagram-Personalization.json` | `personalization_generator.py` |
| `singleview/` | `hvymetl-diagram-SingleView.json` | `singleview_generator.py` |
| `oracle/` | `hvymetl-diagram-Oracle.json` | — |

Import any diagram JSON in Migration Studio (see [docs/10-examples.md § Migration Studio](../docs/10-examples.md#migration-studio-diagram-exports)).

## End-to-end Atlas validation

```bash
npm run run-all-examples   # requires MONGODB_URI — see docs/11-run-all-examples.md
```
