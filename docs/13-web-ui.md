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
| **Table details** | Click table on canvas or sidebar | Column types, PKs, FKs |
| **AI-Powered DDL Export** | Full-screen artifact editor (editable + per-file download) | `POST /api/export/migration` + prompts |
| **Full pipeline** | Header → **Run Full Pipeline** (design → csvToAtlas import from CSV exports) | `GET /api/pipeline/config`, `POST /api/pipeline/run` |

Artifact purposes (migration plan, design report, RAG prompts, repository layer):
[15-migration-artifacts.md](15-migration-artifacts.md).

All six pipeline steps (Knowledge + RAG, profiles, design, ETL, import, codegen):
[16-pipeline-steps.md](16-pipeline-steps.md).

## 4. API Reference

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | `{ ok, name }` |
| `GET` | `/api/profiles` | — | Workload presets |
| `GET` | `/api/dialects` | — | Supported database labels |
| `GET` | `/api/templates` | — | Template DDL + parsed model |
| `POST` | `/api/schema/import-ddl` | `{ ddl, dialect }` | `{ model }` |
| `POST` | `/api/schema/import-sqlite` | `multipart database` | `{ model, ddl, sourcePath }` |
| `POST` | `/api/design` | `{ model, profileId, ddl }` | `{ plan, designReport, retrievalStrategy }` |
| `POST` | `/api/export/migration` | `{ model, profileId, ddl }` | Downloads: plan JSON, design report, RAG prompts |
| `POST` | `/api/export/prompts` | `{ ddl, profileId }` | RAG prompt bundle |
| `GET` | `/api/pipeline/config` | — | Non-secret pipeline status (Mongo URI, csvToAtlas, source DB) |
| `POST` | `/api/pipeline/run` | `{ model, profileId, ddl, dialect?, csvSourcePath?, mongoUri?, csvToAtlasPath?, targetDb?, drop? }` | Design + csvToAtlas import summary |
| `POST` | `/api/pipeline/run-with-csv` | `multipart csvs` + form fields | Same as run, with uploaded CSV files |

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

## 7. MongoDB branding

The UI uses the official **LeafyGreen** palette (`#001E2B`, `#00ED64`, `#00684A`,
`#E3FCF7`) per [mongodb.design](https://www.mongodb.design/foundations/palette).

## 8. CLI parity

Design and export are available in the UI. The **Run Full Pipeline** action runs
design → csvToAtlas import when `MONGODB_URI`, `CSV_TO_ATLAS_PATH`, and CSV exports
(`HVYMETL_CSV_SOURCE` or upload) are configured. Works with any schema import dialect
— export row data from your source database as CSV files named after each table.

All pipeline stages remain available without the UI:

```bash
npm run hvymetl -- design --source examples/iot.db --profile iot --out out/iot
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot
npm run import-cli -- out/iot/csv/*.csv collectionName
```
