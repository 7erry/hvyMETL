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
| **Instant Schema Import** | Sidebar → paste DDL → Import Query | `POST /api/schema/import-ddl` |
| **Broad Database Support** | Dialect selector (PostgreSQL, MySQL, SQLite, MSSQL, ClickHouse, Oracle) | DDL parser; SQLite file upload live |
| **Customizable ER Diagrams** | Main canvas (drag tables, zoom, minimap) | React Flow + `SqlStructuralModel` |
| **Sharing** | Export / Import diagram JSON | Client-side + full model in file |
| **Duplicate table** | Canvas header ⧉ or sidebar list | `duplicateTableInModel` |
| **Snap to Grid** | Checkbox; hold **Shift** for free positioning | 20px grid |
| **Templates** | Dropdown → Load template | `GET /api/templates` |
| **Session state** | Auto-saved in `sessionStorage` (schema, layout, artifacts survive refresh) | Client-side |
| **Table details** | Click table on canvas or sidebar | Column types, PKs, FKs |
| **AI-Powered DDL Export** | Full-screen artifact editor (editable + per-file download) | `POST /api/export/migration` + prompts |
| **Full pipeline** | Header → **Run Full Pipeline** (design → ETL → Atlas import) | `GET /api/pipeline/config`, `POST /api/pipeline/run` |

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
| `POST` | `/api/pipeline/run` | `{ model, profileId, ddl, sourceDbPath?, mongoUri?, csvToAtlasPath?, targetDb?, dryRun?, drop? }` | Design + ETL + import summary |
| `POST` | `/api/pipeline/run-with-source` | `multipart database` + form fields | Same as run, with uploaded SQLite source |

## 5. Diagram export format

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

## 6. MongoDB branding

The UI uses the official **LeafyGreen** palette (`#001E2B`, `#00ED64`, `#00684A`,
`#E3FCF7`) per [mongodb.design](https://www.mongodb.design/foundations/palette).

## 7. CLI parity

Design and export are available in the UI. The **Run Full Pipeline** action runs
design → ETL → csvToAtlas import when `MONGODB_URI`, `CSV_TO_ATLAS_PATH`, and a
SQLite source (`HVYMETL_SOURCE_DB` or upload) are configured.

All pipeline stages remain available without the UI:

```bash
npm run hvymetl -- design --source examples/iot.db --profile iot --out out/iot
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot
npm run import-cli -- out/iot/csv/*.csv collectionName
```
