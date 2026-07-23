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

See [docs/20-agent-copilot-mongodb-inspect.md](docs/20-agent-copilot-mongodb-inspect.md).

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
