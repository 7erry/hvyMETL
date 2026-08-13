# Copilot

The **Copilot** is Migration Studio's AI-assisted sidebar for SQL-to-MongoDB migration. It runs canvas mutations in the browser, migration workflow steps against live studio handlers, and read-only Atlas inspect/analyze tools server-side via a MongoDB MCP proxy.

Open it with **⌘K** / **Ctrl+K** or the **◈ Copilot** launcher in the lower-right corner. The header shows copilot status, active preset, LLM model (or offline heuristics), and whether Atlas inspect is online.

## Tabs

| Tab | Purpose |
| --- | --- |
| **Chat** | Natural language, slash commands, quick-action chips, tool execution cards |
| **Query Translator** | Paste T-SQL / PostgreSQL and get aggregation pipeline JSON, Mongoose script, shell code, and index recommendations. Use **Run Code** on the Aggregation JSON tab to execute the pipeline against Atlas (requires MongoDB inspect). |

## Guided migration workflow

The copilot can run each studio step as a **workflow tool** — one step at a time unless you ask for several explicitly.

Typical path:

1. **Clear session** — wipe canvas state and open schema import
2. **Import SQL** — paste DDL or load a built-in example (`oracle`, `analytics`, `cms`, `iot`, `ledger`, `mobile`, `catalog`, `personalization`, `singleview`)
3. **Refresh design** — regenerate the MongoDB target schema (ML/RAG)
4. **Run pipeline** — open the Atlas import panel and load CSV/SQLite data
5. **Verify collections** — list collections in the logical target database (e.g. `csv_to_atlas`)

### Start the walkthrough

Say or click:

- **Migration steps** quick chip, or
- *Guide me through the migration workflow: clear session, import SQL, refresh design, run pipeline, then list collections.*

Copilot runs one workflow tool per turn and summarizes the result.

### Next step buttons

After a workflow or inspect tool succeeds, the **Tool Executed** card shows a **Next step** button so you can continue without typing:

| Completed step | Suggested next step |
| --- | --- |
| Import SQL / Import Example | **Refresh design** |
| Refresh design | **Run pipeline** |
| Run pipeline (success) | **Verify collections in `{db}`** |

Click **Next step** on the card to run the follow-up immediately.

### Slash commands (workflow)

| Command | Action |
| --- | --- |
| `/clear-session` | Clear session and open schema import |
| `/refresh-design` | Run Refresh design |
| `/run-pipeline` | Open Run pipeline panel |

Natural-language aliases also work: *clear session*, *refresh design*, *run pipeline*, *import oracle example*, etc.

## Quick-action chips

Below the chat input:

| Chip | Sends |
| --- | --- |
| **Available Commands** | *what are all the commands you know?* — full command reference |
| **Migration steps** | Guided workflow prompt (see above) |
| **Check Guardrails** | Migration risk analysis on the current ERD |
| **Optimize Schema** | Architecture review of the current design |
| **Translate SQL** | Opens SQL translation flow |

Type `/` to open the slash-command autocomplete menu.

## Help prompts

These bypass the LLM and return static reference text:

| You ask | Response |
| --- | --- |
| *how can you help?* / *what can you do?* | Capability overview + suggested *Guide me through the migration workflow* |
| *what are all the commands you know?* / *list commands* | Full slash commands, workflow phrases, canvas tools, and inspect phrases |
| *what is the current raw data size?* / *dataset scale — raw data* | Manager **Dataset scale — raw data** override or schema estimate |

## Manager dataset scale in copilot

The **Dataset scale — raw data** slider in Manager view (`Migration Cost Projection`) is sent to Copilot on every LLM turn as `schemaContext.datasetScale`. Use it when CSV import has not loaded real row counts but you still need sizing, tier, or sharding guidance.

| Source | When used |
| --- | --- |
| **Manager slider override** | `estimatedDataGb > 0` — authoritative raw data size (up to 21 TB) |
| **Schema estimate** | DDL loaded, no slider override — heuristics from column types and default/plan row counts |
| **Unavailable** | No schema and no slider override |

The system prompt includes projected storage, workload profile, illustrative Atlas tier, and sharding recommendations derived from the same projection engine as Manager view. Architecture reviews (**Optimize Schema**) should cite this context in collapsible **§8 MongoDB Atlas cluster sizing** (RAM/tier working-set rule, storage headroom table, replica set & backup, sharding verdict, validation steps) and in §5–§6 where relevant.

Manager settings persist in session state (`managerCostInputs`) and sync to hosted workspace storage when enabled.

## Canvas & schema tools

Executed in the browser against live ERD / embed state:

| Tool / command | Purpose |
| --- | --- |
| `/fold child -> parent [array\|single]` | Embed a child table into a parent collection |
| `/guardrails` / **Check Guardrails** | Migration risk analysis (unbounded arrays, 16 MB docs, missing PKs, orphan FKs) |
| `/translate` / **Translate SQL** | SQL → MongoDB aggregation / Mongoose / shell |
| `/highlight table1 table2` | Focus tables on the canvas |
| `/clear-overrides` | Reset embed overrides |
| **Optimize Schema** | LLM architecture review markdown (`# {Name} — Architecture Review`) |

Guardrail warning badges on table nodes open the copilot with an optimization prompt when clicked.

## Architecture review → Google Docs

**Optimize Schema** produces a markdown architecture review. When the response matches `# … — Architecture Review` (em dash, en dash, or hyphen), an **Export** bar appears below the message:

Post-import **Architecture Review** runs inspect tools first (`listMongoCollections`, indexes, schema); the written review is always shown afterward and is **not** treated as a duplicate inspect listing, so export controls remain available.

| Control | Behavior |
| --- | --- |
| **Save to Google Docs** | OAuth sign-in → creates a native Google Doc in your Drive → opens in a new tab |
| **Download markdown** | Client-side `.md` download (always available) |

When you create **autoEmbed vector search indexes** in the studio (dialog or copilot tool), they are recorded for the session and injected into copilot **schema context**. Architecture reviews and **design-report.md** (export / pipeline artifacts) then include each index, sample `$vectorSearch` aggregations (`query` for autoEmbed), and operational guidance (`numCandidates` vs `limit`, pre-filter vs post-filter, RAM/quantization/tier limits, hybrid RRF).

After **Refresh design**, copilot schema context also includes **search field hints** derived from each collection’s string fields: paths like `product_name`, `title`, or `sku` → **Atlas Search autocomplete** (keyword/fuzzy/faceting); paths like `description`, `summary`, or `body` → **Atlas Vector Search (autoEmbed)**. Architecture review **§6** must apply these hints, recommend **hybrid search** (`$search` + `$vectorSearch` / RRF) when both field classes exist on a collection, and align with any studio **Atlas Search** or **vector** indexes already in context.

Implementation: markdown is converted to HTML client-side, then uploaded via the Google Drive API (`application/vnd.google-apps.document`). The legacy Google **Save to Drive** widget is not used.

### Google Docs setup

Add to the **server** `.env` (not Vite):

```bash
GOOGLE_DRIVE_CLIENT_ID=123456789012-abc....apps.googleusercontent.com
```

One-time Google Cloud setup:

1. Enable **Google Drive API** in your GCP project
2. Configure **OAuth consent screen** (add test users if app is in Testing mode)
3. Create **OAuth 2.0 Web client** credentials
4. **Authorized JavaScript origins** must include where the studio runs:
   - `http://localhost:3847` (local)
   - `https://hvymetl.studio` (hosted)
5. Restart the hvyMETL server

The copilot status endpoint exposes `googleDrive.clientId` when configured; without it, **Save to Google Docs** is disabled and a hint is shown.

This is separate from Auth0 login (`VITE_AUTH0_CLIENT_ID`) — only the public OAuth **Client ID** is needed; no client secret in the browser flow.

## MongoDB inspect & analyze

Read-only Atlas tools run **server-side** so `MONGODB_URI` never reaches the client. Canvas tools still run in the browser.

### Phase 1 — Inspect

| Copilot tool | Purpose |
| --- | --- |
| `listMongoDatabases` | Databases owned by the signed-in user |
| `listMongoCollections` | Collections in a logical database |
| `describeMongoCollectionSchema` | Inferred document schema (field path + types table in UI) |
| `listMongoCollectionIndexes` | Classic + Atlas Search indexes |
| `findMongoDocuments` | Read-only find (max 25 docs) |

Natural-language routing examples:

- *show me databases* / *list databases*
- *list collections in `csv_to_atlas`*
- *describe `csv_to_atlas.orders`* / *describe orders in csv_to_atlas*

### Phase 2 — Analyze

| Copilot tool | Purpose |
| --- | --- |
| `aggregateMongoCollection` | Read-only aggregation (max 20 stages, 50 docs) |
| `explainMongoOperation` | Query planner / execution stats |
| `compareMongoCollectionToPlan` | Live Atlas vs current migration plan |

Run **Refresh design** before compare-to-plan so field, embed, and index expectations are loaded. Comparison statuses: **Match**, **Missing**, **Extra**, **Warn**.

Structured results render in tool cards (schema field tables, aggregate/explain/compare tables) — the LLM does not re-echo those tables in chat.

### Phase 3 — autoEmbed vector index

From schema or index inspect tool cards, **Create autoEmbed vector index…** opens a dialog to configure Automated Embeddings (Preview) on a text field. The API uses the MongoDB driver with the same tenant URI as pipeline imports. Inspect/analyze MCP tools stay read-only.

See [20-agent-copilot-mongodb-inspect.md](20-agent-copilot-mongodb-inspect.md) for MCP configuration, multi-tenant isolation, and API details.

## Pipeline self-healing

When a pipeline run fails, the copilot shows the error with heuristic fix suggestions and **Apply Fix & Re-run** / **Dismiss**.

## Configuration

### Grove LLM (chat + tool calling)

```bash
GROVE_API_KEY=your_grove_api_key
# GROVE_API_URL=https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1/chat/completions
# GROVE_MODEL=gpt-5.6-luna
```

When Grove is not configured, the sidebar falls back to offline heuristics for direct commands (help, commands list, workflow phrases, inspect routing).

### MongoDB MCP (inspect/analyze)

```bash
HVYMETL_MCP_MONGODB_URL=http://127.0.0.1:3000/mcp
HVYMETL_MCP_MONGODB_ENABLED=1
# HVYMETL_MCP_MONGODB_HEADERS={"x-api-key":"shared-secret"}
```

Start the MCP server (read-only recommended):

```bash
npx -y mongodb-mcp-server@latest --transport http --readOnly --httpHost=127.0.0.1 --httpPort=3000
```

Inspect uses the same MongoDB URI as pipeline imports (tenant secrets on hosted studio, or `MONGODB_URI` locally).

### Google Docs export

See [Architecture review → Google Docs](#architecture-review--google-docs) above.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/copilot/status` | `configured`, `model`, `mongoInspect`, `googleDrive` |
| `POST /api/copilot/chat` | Grove chat with schema context and tool calling |
| `POST /api/copilot/mongo/inspect` | `{ tool, args, planContext? }` — direct inspect/analyze invocation |
| `POST /api/copilot/architecture-export` | Stage markdown for legacy download URLs (optional) |

When MCP is down, inspect returns HTTP 503; chat and canvas tools continue to work.

## Code map

| Module | Role |
| --- | --- |
| `web/src/components/AgentCopilotSidebar.tsx` | Sidebar UI, chips, slash menu |
| `web/src/copilot/CopilotContext.tsx` | Chat loop, tool dispatch, workflow handlers |
| `web/src/copilot/copilotHelp.ts` | Help / Available Commands static responses |
| `web/src/copilot/workflowTools.ts` | Workflow tools, next-step chaining |
| `web/src/components/copilot/ToolExecutionCard.tsx` | Tool result cards + structured tables |
| `web/src/components/copilot/ArchitectureReviewSaveToDrive.tsx` | Google Docs + markdown export |
| `web/src/copilot/buildDatasetScaleContext.ts` | Maps Manager inputs → copilot dataset scale payload |
| `src/copilot/copilotDatasetScale.ts` | Prompt formatting and dataset scale Q&A |
| `src/copilot/architectureReviewHtml.ts` | Markdown → HTML for Google Docs |
| `src/copilot/groveChat.ts` | Grove LLM proxy |
| `src/copilot/mongoInspectService.ts` | MCP inspect/analyze dispatch |
| `src/server/copilotRoutes.ts` | Copilot HTTP routes |

## Verification

```bash
npm test -- web/src/copilot/copilotHelp.test.ts web/src/copilot/schemaContext.test.ts \
  tests/copilot/copilotDatasetScale.test.ts web/src/copilot/workflowTools.test.ts \
  tests/copilot/architectureReviewHtml.test.ts src/server/copilotRoutes.test.ts \
  src/copilot/mongoInspectService.test.ts
npm run build --prefix web
```
