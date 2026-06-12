# 13 — Web UI (Migration Studio)

Sources: [`web/README.md`](../web/README.md), [`web/`](../web/), [`src/server/index.ts`](../src/server/index.ts)

## 1. High-Level Summary

The **hvyMETL Migration Studio** is an optional MongoDB-branded web interface for
visual schema design and AI-powered migration export. The CLI remains fully
available — every UI action maps to the same design engine, RAG layer, and export
artifacts as `npm run hvymetl`.

## 2. Running the UI

| Command | Purpose |
| --- | --- |
| `npm run dev:ui` | API on `:3847` + Vite dev server on `:5173` (hot reload) |
| `npm run start:ui` | Production build served from `:3847` |
| `npm run build:ui` | Build API + static web assets only |

Open **http://localhost:5173** (dev) or **http://localhost:3847** (production).

Environment: `.env` is loaded by the API server (`MONGODB_MODEL_KEY` for hybrid RAG
exports, same as CLI).

## 3. Features

| Feature | UI location | Backend |
| --- | --- | --- |
| **Instant Schema Import** | Sidebar → paste DDL → Import Query, or **Import file** (DDL auto-imports on select) | `POST /api/schema/import-ddl` |
| **Broad Database Support** | Dialect selector (PostgreSQL, MySQL, SQLite, MSSQL, ClickHouse, Oracle, IBM Db2, CockroachDB, Amazon Aurora, Google Cloud Spanner) | DDL parser; SQLite file upload live |
| **Customizable ER Diagrams** | Main canvas (drag tables, zoom, minimap) | React Flow + `SqlStructuralModel` |
| **Sharing** | Export / Import diagram JSON | Client-side + full model in file |
| **Duplicate table** | Canvas header ⧉ or sidebar list | `duplicateTableInModel` |
| **Snap to Grid** | Checkbox; hold **Shift** for free positioning | 20px grid |
| **Templates** | Dropdown → Load template | `GET /api/templates` |
| **Session state** | Auto-saved in `sessionStorage` (schema, layout, artifacts survive refresh) | Client-side |
| **Workload auto-detect** | Profile dropdown updates after schema import (e.g. E-commerce Catalog for product/order schemas) | `inferWorkloadProfile()` on import |
| **Table details** | Click table on canvas or sidebar | Column types, PKs, FKs |
| **AI-Powered DDL Export** | Full-screen artifact editor (editable + per-file download) | `POST /api/export/migration` + prompts |
| **Repository codegen** | Language dropdown + **Generate repositories** (13 MongoDB client drivers) | `GET /api/repogen/languages`, `POST /api/repogen/generate` |
| **Full pipeline** | Header → **Run Full Pipeline** (ML design → shaped CSV import → Atlas persistence) | `GET /api/pipeline/config`, `POST /api/pipeline/run`, `GET /api/pipeline/executions` |

Artifact purposes (migration plan, design report, RAG prompts, repository layer):
[15-migration-artifacts.md](15-migration-artifacts.md).

All six pipeline steps (Knowledge + RAG, profiles, design, ETL, import, codegen):
[16-pipeline-steps.md](16-pipeline-steps.md).

## 4. API Reference

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | `{ ok, name }` |
| `GET` | `/api/profiles` | — | Workload presets |
| `POST` | `/api/profiles/infer` | `{ model }` | Infer workload profile from table names and relationships |
| `GET` | `/api/dialects` | — | Supported database labels |
| `GET` | `/api/templates` | — | Template DDL + parsed model |
| `POST` | `/api/schema/import-ddl` | `{ ddl, dialect }` | `{ model }` |
| `POST` | `/api/schema/import-sqlite` | `multipart database` | `{ model, ddl, sourcePath }` |
| `POST` | `/api/design` | `{ model, profileId, ddl }` | `{ plan, designReport, retrievalStrategy }` |
| `POST` | `/api/export/migration` | `{ model, profileId, ddl }` | Downloads: plan JSON, design report, RAG prompts |
| `POST` | `/api/export/prompts` | `{ ddl, profileId }` | RAG prompt bundle |
| `GET` | `/api/repogen/languages` | — | Supported client languages (`node`, `python`, `go`, `java`, …) |
| `POST` | `/api/repogen/generate` | `{ planJson, language }` | Typed repositories for the chosen driver |
| `GET` | `/api/pipeline/config` | — | Non-secret pipeline status (Mongo URI, csvToAtlas, source DB) |
| `POST` | `/api/pipeline/run` | `{ model, profileId, ddl, dialect?, csvSourcePath?, mongoUri?, csvToAtlasPath?, targetDb?, drop? }` | ML design + csvToAtlas import + MongoDB execution record |
| `POST` | `/api/pipeline/run-with-csv` | `multipart csvs` + form fields | Same as run, with uploaded CSV files |
| `GET` | `/api/pipeline/executions?limit=20` | — | Recent pipeline runs from `hvymetl_pipeline_executions` |
| `GET` | `/api/pipeline/executions/:executionId` | — | One run (includes migration plan, design report, csv manifest) |

## 5. Supported SQL dialects

Full reference: **[18-sql-dialects.md](18-sql-dialects.md)** (live vs DDL paste, ETL
paths, limitations, Oracle examples).

Dialect definitions live in [`src/dialects.ts`](../src/dialects.ts). The UI loads them
from `GET /api/dialects`. Only **SQLite** has a live file adapter; every other dialect
uses the shared DDL parser ([`src/utilities/ddlParser.ts`](../src/utilities/ddlParser.ts))
via **Import Query** (paste `CREATE TABLE` scripts).

| Dialect ID | Label | Import mode | Notes |
| --- | --- | --- | --- |
| `sqlite` | SQLite | File upload **or** DDL paste | Live introspection via `better-sqlite3` |
| `postgresql` | PostgreSQL | DDL paste | Standard `CREATE TABLE`, inline and table-level FKs |
| `mysql` | MySQL | DDL paste | Backtick-quoted identifiers |
| `mssql` | Microsoft SQL Server | DDL paste | T-SQL `CREATE TABLE` |
| `clickhouse` | ClickHouse | DDL paste | Column-oriented DDL subset |
| `oracle` | Oracle | DDL paste | `CONSTRAINT … FOREIGN KEY`, `VARCHAR2`, `NUMBER`, identity columns |
| `db2` | IBM Db2 | DDL paste | Schema-qualified names (`"SALES"."ORDERS"`), quoted FK references |
| `cockroachdb` | CockroachDB | DDL paste | PostgreSQL-compatible; `IF NOT EXISTS`, `INT8`, `UUID` |
| `aurora-postgresql` | Amazon Aurora (PostgreSQL) | DDL paste | Same parser rules as PostgreSQL |
| `aurora-mysql` | Amazon Aurora (MySQL) | DDL paste | Same parser rules as MySQL |
| `spanner` | Google Cloud Spanner | DDL paste | Trailing `PRIMARY KEY (…)`, `INTERLEAVE IN PARENT`, `INT64` / `STRING` / `BYTES` types |

The dialect selector sets the `source` label on the structural model (e.g.
`ddl:db2`) and helps you pick the right DDL syntax when pasting; parsing is shared
across dialects with targeted handling for qualified names, quoted FK targets, and
Spanner-style primary keys.

**Limitations:** the parser extracts tables, columns, primary keys, and foreign keys
for ER diagrams and design — it does not execute DDL, infer row counts, or model
Spanner interleaving as parent-child embed rules (interleaved tables appear as
separate nodes with FK-like relationships when declared).

## 6. Diagram export format

```json
{
  "version": 1,
  "name": "ddl:postgresql",
  "dialect": "postgresql",
  "ddl": "CREATE TABLE …",
  "model": { "tables": [], "relationships": [] },
  "positions": { "users": { "x": 40, "y": 40 } },
  "exportedAt": "2026-06-11T…"
}
```

### Bundled example diagrams

Every folder under [`examples/`](../examples/) includes a checked-in diagram export
you can load immediately:

| Path | Domain |
| --- | --- |
| `examples/analytics/hvymetl-diagram-Analytics.json` | Real-time analytics |
| `examples/catalog/hvymetl-diagram-Catalog.json` | E-commerce catalog |
| `examples/cms/hvymetl-diagram-CMS.json` | Content management |
| `examples/iot/hvymetl-diagram-IOT.json` | IoT telemetry |
| `examples/mobile/hvymetl-diagram-Mobile.json` | Mobile backend |
| `examples/personalization/hvymetl-diagram-Personalization.json` | Personalization |
| `examples/singleview/hvymetl-diagram-SingleView.json` | Single customer view |
| `examples/oracle/hvymetl-diagram-Oracle.json` | Oracle multi-domain bundle |

Sidebar → **Import diagram JSON** → pick the file. Full reference:
[10-examples.md § Migration Studio diagram exports](10-examples.md#migration-studio-diagram-exports).

## 7. MongoDB branding

The UI uses the official **LeafyGreen** palette (`#001E2B`, `#00ED64`, `#00684A`,
`#E3FCF7`) per [mongodb.design](https://www.mongodb.design/foundations/palette).

## 8. Repository codegen (13 languages)

After **AI Migration Export**, the artifact view shows a **Repository language**
dropdown and **Generate repositories** button. Pick any MongoDB officially supported
client driver; generated files open as read-only tabs (connection module, index
bootstrap, one repository per collection).

![Repository language picker in Migration Studio](../web/docs/screenshots/repository-language-picker.png)

| Language | `--lang` id | Driver |
| --- | --- | --- |
| Node.js (TypeScript) | `node` | `mongodb` |
| Python | `python` | `pymongo` |
| Go | `go` | `mongo-go-driver` |
| Java | `java` | `mongodb-driver-sync` |
| Kotlin | `kotlin` | `mongodb-driver-sync` |
| C# | `csharp` | `MongoDB.Driver` |
| Ruby | `ruby` | `mongo` gem |
| PHP | `php` | `mongodb/mongodb` |
| Rust | `rust` | `mongodb` crate |
| Scala | `scala` | `mongodb-scala` |
| Swift | `swift` | `MongoSwift` |
| C | `c` | `libmongoc` |
| C++ | `cpp` | `mongocxx` |

CLI equivalent: `npm run hvymetl -- repogen --plan … --out … --lang python`. Full
reference: [08-repogen.md](08-repogen.md). Screenshots: [web/README.md § Screenshots](../web/README.md#screenshots).

## 9. CLI parity

Design and export are available in the UI. The **Run Full Pipeline** action runs
**ML-enhanced design** → **CSV shaping** → **csvToAtlas import** when `MONGODB_URI`,
`CSV_TO_ATLAS_PATH`, and CSV exports (`HVYMETL_CSV_SOURCE` or upload) are configured.
Works with any schema import dialect — export row data from your source database as
CSV files named after each table (e.g. `orders.csv`, `order_items.csv`).

Implementation: [`src/server/runPipeline.ts`](../src/server/runPipeline.ts).

### What the web pipeline does

| Stage | Behavior |
| --- | --- |
| **CSV enrichment** | Row counts and FK cardinality measured from CSV exports before design ([`csvModelEnrichment.ts`](../src/utilities/csvModelEnrichment.ts)) |
| **ML design** | `designFromModelWithMlEngine` — reranker, critic, lessons-learned RAG, migration logs ([`pipelinePatch.ts`](../src/ml_engine/pipelinePatch.ts)) |
| **CSV shaping** | Embeds, extended references, and computed counters merged into `out/ui-pipeline/csv-shaped/*.csv` ([`csvShaper.ts`](../src/utilities/csvShaper.ts)) |
| **Import** | Shaped (or flat) CSVs imported via csvToAtlas into `targetDb` |
| **Feedback loop** | Per-collection decisions logged; post-import reflection upserts lessons when metrics breach thresholds |
| **Execution archive** | Full run persisted to MongoDB (see §10) |

Disk artifacts are still written under `out/ui-pipeline/`:

| File | Role |
| --- | --- |
| `migration-plan.json` | Pattern-driven collection plan |
| `design-report.md` | Human-readable design report (includes ML trace) |
| `csv-import-manifest.json` | Collection → CSV file mapping used for import |
| `csv-shaped/*.csv` | Pattern-compliant import files (embedded `field[]` JSON columns) |
| `feedback-manifest.json` | `executionId`, memory DB, migration log IDs |

All pipeline stages remain available without the UI:

```bash
npm run hvymetl -- design --source examples/iot/iot.db --profile iot --out out/iot
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot
npm run import-cli -- out/iot/csv/*.csv collectionName
```

## 10. MongoDB persistence (pipeline runs & ML memory)

When `MONGODB_URI` is set, each **Run Full Pipeline** execution is archived in Atlas
alongside the ML feedback loop. This is separate from the **import target database**
(`targetDb` / `MONGODB_DB` on the csvToAtlas import) unless you configure otherwise.

### Memory database

| Variable | Default | Purpose |
| --- | --- | --- |
| `HVYMETL_MEMORY_DB` | — | Preferred database for all `hvymetl_*` metadata collections |
| (fallback) | `hvymetl_memory` | Used when `HVYMETL_MEMORY_DB` is unset |

Set `HVYMETL_MEMORY_DB=hvymetl_memory` in `.env` to keep migration metadata separate
from application data in `MONGODB_DB`.

### Collections

| Collection | Written when | Contents |
| --- | --- | --- |
| `hvymetl_pipeline_executions` | Every pipeline run | `migrationPlan`, `designReport`, `csvImportManifest`, imports, errors, timestamps |
| `hvymetl_migration_logs` | ML design phase | Per-collection decisions, telemetry, critic predictions |
| `hvymetl_lessons_learned` | Post-import reflection (on metric breach) | Semantic failure lessons with optional embeddings |

### Pipeline execution document

Each run gets a unique `executionId` (returned in the API response as `execution`):

```json
{
  "executionId": "…",
  "completedAt": "2026-06-12T…",
  "ok": true,
  "profileId": "catalog",
  "targetDb": "oracle_migration",
  "memoryDb": "hvymetl_memory",
  "migrationPlan": { },
  "designReport": "# Migration Design Report (ML-Enhanced)\n…",
  "csvImportManifest": {
    "csvSource": "/path/to/csv",
    "schemaDialect": "oracle",
    "collections": [{ "name": "orders", "files": ["…/csv-shaped/orders.csv"] }]
  },
  "imports": [{ "collection": "orders", "ok": true, "insertedCount": 3500 }],
  "migrationLogIds": ["ddl:oracle:orders-…"],
  "reflectionScheduled": true
}
```

Retrieve runs:

```bash
curl "http://localhost:3847/api/pipeline/executions?limit=10"
curl "http://localhost:3847/api/pipeline/executions/<executionId>"
```

Deep dive on lessons learned and reflection: [17-ml-engine.md](17-ml-engine.md).
