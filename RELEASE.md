## hvyMETL 3.2.3

Full-text search chat commands open a **field picker dialog** (like vector search) instead of letting the LLM guess indexed fields.

- **NL routing:** `create full text search index on products` → studio dialog with database, collection, pattern, and explicit field selection (no auto-selected fields).
- **Inspect cards:** **Create full-text search index…** button alongside autoEmbed vector index.
- **LLM guardrails:** `createMongoAtlasSearchIndex` tool instructions require confirmed field paths or the dialog flow.

---

## hvyMETL 3.2.2

Adds **Atlas MongoDB Search (lexical)** index creation and query samples—keyword, autocomplete, and faceted patterns—alongside existing autoEmbed vector search.

### Highlights

- **`createMongoAtlasSearchIndex` copilot tool** and **`POST /api/copilot/mongo/atlas-search-index`**: build [Search index definitions](https://www.mongodb.com/docs/search/index/index-definitions/) with `mappings.fields` and create indexes via the MongoDB driver (`type: "search"`).
- **Patterns:** **keyword** (`$search.text`), **autocomplete** (`$search.autocomplete` + fuzzy), **faceted** (`$searchMeta` facet buckets for `stringFacet` / `numberFacet` fields).
- **Architecture context:** session-recorded lexical indexes inject sample aggregations and JSON definitions into copilot prompts and **design-report.md** exports (with vector search sections).
- **Unit tests:** index builders, sample pipelines, tool registration, and API route coverage.

### Verification

- `npm test -- src/copilot/mongoAtlasSearchIndex.test.ts src/copilot/copilotAtlasSearchContext.test.ts src/server/copilotAtlasSearchIndexRoutes.test.ts`

---

## hvyMETL 3.2.1

Patch release that completes **autoEmbed vector index** studio UX and copilot routing on top of 3.1.2 Phase 3.

### Highlights

- **Database → collection → field pickers:** the **Create autoEmbed vector index…** dialog loads logical databases and collections from inspect, then describes schema for the selected target—no more dead ends on placeholder `database` / `collection` hints.
- **Multi-database collections:** when a collection name exists in more than one logical database, a **Database** picker appears instead of a blocking error.
- **Field list quality:** all inferred schema fields (with BSON types) appear in the dropdown; migration-plan `jsonSchema` types fill in when MCP sampling returns `unknown` (e.g. `description` as `string | null`, matching the After Mongo canvas).
- **Pipeline context:** after a successful **Run Full Pipeline**, copilot remembers the import **target database** and uses it when opening the vector index dialog or calling `createMongoAutoEmbedVectorIndex` without an explicit database.
- **Natural-language targets:** chat phrases like `create vector search index on Vectors.products` parse as **database.collection**; `products.description` still means collection + text field.
- **Stability:** single portal dialog, one schema fetch per open, and fixes for copilot tab freezes from modal effect loops; vector search chat routing works when MCP probe messaging differs.

### Copilot vector search (quick reference)

- Studio button or chat: `create vector search on products`, `create vector search on products.description`, `create vector search index on my_db.products`.
- Requires MongoDB inspect enabled (`HVYMETL_MCP_MONGODB_ENABLED`); index creation uses the MongoDB driver + tenant URI (not read-only MCP).

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 3.1.2

Minor release adding **Agent Copilot Phase 3**: create Atlas Vector Search **autoEmbed** indexes from inspect results, with full Automated Embeddings options (Voyage model, quantization, dimensions, similarity).

### Highlights

- **autoEmbed vector index dialog:** after `describeMongoCollectionSchema` or `listMongoCollectionIndexes`, use **Create autoEmbed vector index…** to pick the text field, model (`voyage-4-lite`, `voyage-4`, `voyage-4-large`, `voyage-code-3`), quantization (`float`, `scalar`, `binary`, `binaryNoRescore`), dimensions (256–2048), and similarity (`cosine`, `dotProduct`, `euclidean`).
- **`POST /api/copilot/mongo/vector-index`:** server creates the index via the MongoDB driver (tenant URI, logical database names) so options match [Atlas autoEmbed index fields](https://www.mongodb.com/docs/vector-search/index/vector-search-type/?deployment-type=atlas&embedding=auto&interface=driver&language=python#std-label-avs-types-vector-search). Read-only MCP inspect/analyze is unchanged.
- **`createMongoAutoEmbedVectorIndex` copilot tool:** chat can create autoEmbed indexes (not only the inspect-card dialog); the model is instructed to call `describeMongoCollectionSchema` when the text field is unknown.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 2.1.0

Minor release focused on **Query Translator execution**, **aggregate result UX**, **Manager ↔ Copilot sizing context**, **Google Docs export**, and **studio build reliability** since 2.0.0.

### Highlights

- **Query Translator Run Code:** execute translated aggregation pipelines against Atlas directly from the translator tab; results use the same tool-card layout as chat (summary, collapsible paginated table, total/returned counts).
- **Aggregate & analyze results UI:** collapsible scrollable tables with sticky headers, Previous/Next pagination (10 rows per page), explicit **total matched** vs **returned in preview** labels, and truncation hints when Atlas inspect byte limits apply.
- **SQL translator fixes:** comparison operators in `WHERE` (`>`, `>=`, `<`, `<=`, `!=`) map to MongoDB `$match` predicates; literal case preserved (no lowercasing `'ACTIVE'`); empty Run Code results fixed when match count was present but previews were truncated.
- **Manager dataset scale → Copilot:** Manager **Dataset scale — raw data** slider feeds copilot `schemaContext` for sizing and sharding guidance when CSV row counts are unavailable.
- **Copilot polish:** collection schema tables in chat, **Available Commands** chip, architecture review **Save to Google Docs** (Drive API + OAuth), migration workflow bar on export view, clickable next-step buttons, and custom profile `readPreference` patch when applied to migration plans.
- **Pipeline reliability:** fix first-run pipeline failure from SSE stream parsing.
- **Studio build (`build:ui`):** replace `react-syntax-highlighter` (594 grammars) with selective Prism highlighting; split Vite chunks, raise Node heap for minification, and add step progress via `scripts/build-ui.mjs` — builds complete in ~1s (~643 modules vs ~1444).

### Configuration

Google Docs export for architecture reviews requires a server OAuth Web client ID:

```bash
GOOGLE_DRIVE_CLIENT_ID=your_google_oauth_web_client_id
```

See [docs/20-agent-copilot.md](docs/20-agent-copilot.md).

### Verification

- `npm test`
- `npm run build`
- `npm run -s build:ui`

---

## hvyMETL 2.0.0

Major release focused on **guided migration workflow in Agent Copilot**, MongoDB inspect/analyze maturity, schema import breadth, and studio polish since 1.9.0.

### Highlights

- **Copilot migration workflow:** new tools to run each studio step — `clearSession`, `importSchemaDdl`, `importBuiltinExample`, `refreshDesign`, `runPipeline` — plus `listMongoCollections` to verify Atlas data. **Migration steps** quick chip and slash commands (`/clear-session`, `/refresh-design`, `/run-pipeline`).
- **Copilot help:** asking *how can you help?* returns a capability overview with **Guide me through the migration workflow** as the suggested next prompt.
- **MongoDB inspect & analyze (Phase 2):** `aggregateMongoCollection`, `explainMongoOperation`, and `compareMongoCollectionToPlan` via MCP, with structured UI tables for aggregation, explain, and plan comparison results.
- **Inspect reliability:** tenant logical-database discovery (client prefix + hash/legacy names), large-database listing fixes, and duplicate listing suppression (no echoed markdown tables after tool cards).
- **Agent Copilot UX:** markdown responses, typing indicator, chat input auto-focus, Query Translator layout (results-first split), SQL translation visible in tool cards, and tool calling always enabled.
- **Query Translator:** `ORDER BY … DESC` maps to MongoDB sort `-1`; qualified column names (`o.status`) normalized in `$match` / `$sort`.
- **Schema import:** 10 additional DDL dialects (22 total): Snowflake, BigQuery, Redshift, Databricks/Spark SQL, MariaDB, YugabyteDB, SingleStore, SAP HANA, Teradata, Firebird; dialect dropdown sorted A→Z.
- **Design & embeds:** unchecking **Force embed** keeps child as a separate collection; default ER edge labels use **cardinality** notation (`N → 1`); time-series and multi-parent FK children excluded from default embed.
- **Artifacts:** generated repositories download as a single `hvymetl-repositories-{language}.zip`.
- **Hosted studio fixes:** custom workload telemetry **Apply profile** uses authenticated API calls; Atlas import DB names respect shared-tier length limits.

### Copilot workflow (typical path)

1. Clear session and import SQL (paste DDL or built-in example)
2. **Refresh design** — ML/RAG MongoDB target schema
3. **Run pipeline** — load CSV/SQLite into Atlas
4. **List collections** — confirm imported data in a logical database

Say *Guide me through the migration workflow* in copilot chat to walk through these steps interactively.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.9.0

Minor release adding **MongoDB inspect tools** to Agent Copilot (Phase 1) via a co-hosted MongoDB MCP HTTP server, plus wider resizable copilot/sidebar panels.

### Highlights

- **Agent Copilot MongoDB inspect (Phase 1):** read-only tools to list databases/collections, infer collection schema, list indexes, and run capped `find` queries against imported Atlas data.
- **Server-side MCP proxy:** `POST /api/copilot/mongo/inspect` calls the co-hosted MongoDB MCP server; tenant database prefixes are applied server-side and **never shown** to users or the LLM (logical names only).
- **Graceful degradation:** when the MCP service is unavailable, copilot shows a clear offline message and inspect tool calls return HTTP 503 without breaking chat or canvas tools.
- **Wider panels:** left sidebar and Agent Copilot dividers expand up to 960px.

### Configuration

Add to `.env` on the studio host (MCP co-located on localhost):

```bash
HVYMETL_MCP_MONGODB_URL=http://127.0.0.1:3000/mcp
HVYMETL_MCP_MONGODB_ENABLED=1
# Optional shared secret headers (must match MCP server MDB_MCP_HTTP_HEADERS)
# HVYMETL_MCP_MONGODB_HEADERS={"x-api-key":"shared-secret"}
```

See [docs/20-agent-copilot.md](docs/20-agent-copilot.md) and [docs/20-agent-copilot-mongodb-inspect.md](docs/20-agent-copilot-mongodb-inspect.md).

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.8.0

Minor release introducing the **Agent Copilot** — an AI-assisted migration assistant in Migration Studio — plus schema UX improvements, new examples, and studio polish since 1.7.1.

### Highlights

- **Agent Copilot sidebar:** collapsible cyberpunk-themed drawer (`⌘K` / `Ctrl+K`) with chat, tool execution cards, slash commands (`/fold`, `/guardrails`, `/translate`, `/clear-overrides`, `/highlight`), and quick-action chips.
- **Grove LLM integration:** server-side proxy to OpenAI-compatible Grove chat completions (`GROVE_API_KEY`, default model `gpt-5.6-luna`); schema-aware system prompt and multi-turn tool-calling loop without exposing API keys to the browser.
- **Canvas agent tools:** `foldTable`, `detachTable`, `setEmbedOverride`, `highlightNodes`, `runGuardrailCheck`, and `translateSQLToMongo` wired to live embed overrides and ERD state.
- **Guardrail engine:** migration risk analysis (unbounded arrays, 16 MB document size, missing PKs, orphan FKs) with interactive warning badges on table nodes; badge clicks open the copilot with an optimization prompt.
- **Query Translator tab:** paste T-SQL / PostgreSQL and get aggregation pipeline JSON, Mongoose script, and shell code with copy and index recommendations.
- **Pipeline self-healing:** failed pipeline runs report errors to the copilot with heuristic fix suggestions and **Apply Fix & Re-run**.
- **Schema UX:** built-in **Load example** picker for repo DDL examples; default ER diagram edges use curved bezier paths; Transformation Summary cross-links to Embed Overrides (and back) for DDL-only imports.
- **Examples & docs:** Financial Ledger PostgreSQL example; knowledge-base pattern example mapping and coverage tests.
- **API artifacts:** OpenAPI and JSON Schema outputs stay aligned with the current migration plan after embed override changes.
- **Auth:** redirect unauthenticated browser visits to `/api/docs` through hosted Swagger login.

### Configuration

Add to `.env` for LLM-powered copilot chat (optional — offline heuristics and slash commands work without it):

```bash
GROVE_API_KEY=your_grove_api_key
# GROVE_API_URL=https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1/chat/completions
# GROVE_MODEL=gpt-5.6-luna
```

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.7.1

Patch release for hosted Migration Studio CSV uploads, pipeline reliability, Atlas Logs, and studio UX fixes since 1.7.0.

### Highlights

- **CSV pipeline uploads:** clearer errors when API responses are HTML instead of JSON; validate CSV filenames against imported SQL tables (e.g. warn on non-table exports).
- **HTTP 413 fixes:** upload CSVs one file at a time; auto-split files over ~900 KB into `*.chunkN.csv` parts before upload (fits common 1 MB reverse-proxy limits).
- **MongoDB Atlas Logs** in Manager View via Atlas Admin API (snapshot, project events, log download) with egress IP and hostname validation guidance.
- **Auth UX:** friendlier session-expired re-login flow; Swagger UI auth fixes on Express 5 and new-tab `access_token` links.
- **Pipeline dialog:** fix config refresh loop / endless loading; keep **Done** label after success; hide csvToAtlas path when configured in server `.env`; per-user pipeline secrets and downloadable zip results on hosted studio.
- **Design:** more aggressive SQL child-table embedding; diagram footer legend icons aligned with collection field glyphs; inline collapsible legends.
- **Dialects:** SAP ASE (Sybase) DDL import support.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.7.0

Hosted Migration Studio release: Auth0 login on [hvymetl.studio](https://hvymetl.studio), per-user tenant isolation, and production auth fallbacks when Auth0 Login Actions are still being wired up.

### Highlights

- Auth0 SPA login with developer/manager/admin roles, Terms page, and mobile-friendly layout.
- Multi-tenant isolation: per-user uploads, artifacts, workspace settings, and pipeline history scoped by Auth0 `sub`.
- Hosted auth config via `GET /api/auth/config` and `GET /api/auth/me` (no build-time `VITE_AUTH0_*` required when `AUTH0_SPA_CLIENT_ID` is set on the server).
- Server role fallbacks: default `developer` for signed-in users without JWT role claims; `HVYMETL_ADMIN_SUBS` bootstrap for admins.
- Auth0 setup walkthrough in `web/README.md`; Atlas egress IP guidance for hosted pipeline runs.
- Fix pipeline settings inputs (MongoDB URI, csvToAtlas path) resetting after each keystroke.

### Verification

- `npm test`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 1.0.0

The 1.0 release formalizes hvyMETL Migration Studio as a complete SQL-to-MongoDB migration planning and execution workflow.

### Highlights

- Visual schema import, Before/After diagrams, manager review, cost projection, and migration readiness workflows.
- Pattern-driven design engine with RAG/ML-enhanced reports, API artifacts, and repository generation.
- Full pipeline execution through mock or exported CSV data, CSV shaping for embedded arrays, csvToAtlas import, MongoDB persistence, and feedback logging.
- Developer Embed Overrides for DDL-only design: max cardinality hints and explicit force-embed controls for linked FK relationships.
- Manager cost center with Atlas sizing, storage/archive savings, and manpower savings estimates.

### Verification

- `npm test -- web/src/cardinalityOverrides.test.ts src/design/patternSelector.test.ts src/server/runDesign.test.ts`
- `npm run build`
- `npm run build --prefix web`
