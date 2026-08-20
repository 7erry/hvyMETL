## hvyMETL 4.3.6

**Architecture Review §9 deployment options** — collective reviews now include a collapsible **Atlas deployment options** section aligned to the MongoDB Well-Architected Framework: multi-region HA, dual auto-scaling, private endpoints, RBAC/SSO, encryption (TLS 1.3, CMK, CSFLE/Queryable Encryption), and a gold-standard operations table.

### Verification

- `npm test -- src/copilot/architectureReviewDeploymentSection.test.ts src/copilot/copilotArchitecturePrompt.test.ts`
- Run **Architecture Review** — output includes §9 with Well-Architected deployment guidance.

---

## hvyMETL 4.3.5

**Copilot Architecture Review message limits** — fixes `Message content exceeds 16384 characters` when a prior Architecture Review reply stays in LLM history. Assistant messages now allow up to 131 KB; tool payloads truncate instead of failing; starting a new Architecture Review clears prior LLM history.

### Verification

- `npm test -- src/copilot/copilotRequestGuard.test.ts`
- Run **Architecture Review** twice in the same session — second run should not 413.

---

## hvyMETL 4.3.4

**Architecture Review doc link fixes** — updates all MongoDB Manual, Search, and Vector Search URLs to current paths (e.g. `group-data/subset-pattern`, `/docs/search/`, `/docs/vector-search/`) so Google Docs exports no longer link to 404 pages.

### Verification

- `npm test -- tests/copilot/architectureReviewDocLinks.test.ts tests/copilot/copilotArchitecturePrompt.test.ts`
- Run **Architecture Review** → **Save to Google Docs** — pattern and search links resolve on mongodb.com.

---

## hvyMETL 4.3.3

**Architecture Review depth & MongoDB doc links** — copilot reviews now require the Review domain checklist (data model, performance, infrastructure, operations), ESR/explain/shard-key/HA coverage, and hyperlinks to official MongoDB docs for Atlas Search, Vector Search, RRF (`$rankFusion`), design patterns, and schema validation. Google Docs export renders markdown links as clickable anchors.

### Verification

- `npm test -- src/copilot/copilotArchitecturePrompt.test.ts tests/copilot/architectureReviewDocLinks.test.ts tests/copilot/architectureReviewHtml.test.ts`
- Run **Architecture Review** → **Save to Google Docs** — §1 includes Review domain table; §6 links Atlas Search / Vector Search / RRF docs.

---

## hvyMETL 4.3.2

**Architecture Review Google Docs** — **Save to Google Docs** now embeds a **Collections diagrams** section with one Migration Studio-style card per collection (fields, BSON types, pattern tags) from the loaded migration plan.

### Verification

- `npm test -- tests/copilot/architectureReviewCollectionDiagram.test.ts tests/copilot/architectureReviewHtml.test.ts`
- Run **Optimize Schema** or **Architecture Review**, then **Save to Google Docs** — each collection appears under **Collections diagrams** below the review title.

---

## hvyMETL 4.3.1

**MongoDB inspect workspace scoping** — fixes false "database is outside your workspace" errors when creating autoEmbed vector indexes (and other inspect tools) on shared Atlas clusters.

### Highlights

- **Tenant discovery** — pipeline history no longer claims another tenant's `{prefix}__{logical}` database when the logical name matches but the prefix does not.
- **Physical DB resolution** — inspect only returns Atlas database candidates the signed-in user owns; clearer errors when the workspace database is missing.
- **Index dialogs** — autoEmbed and Atlas Search index pickers no longer fall back to an unverified pipeline target when `listMongoDatabases` fails.

### Verification

- `npm test -- src/copilot/mongoInspectScope.test.ts src/copilot/mongoInspectService.test.ts`
- Open **Create autoEmbed vector index…** after **Run Full Pipeline** — database dropdown should list only your tenant databases.

---

## hvyMETL 4.3.0

**Copilot LLM security guardrails (Phase 0)** — validates Grove chat requests, caps schema context, rate-limits copilot/sizing/inspect routes, and adds structured audit logging plus a system-prompt injection preamble.

### Highlights

- **`copilotRequestGuard`** — rejects client `system` messages and orphan `tool` turns; enforces message/size limits; bounds `schemaContext`.
- **`copilotRateLimit`** — per-IP sliding window limits (chat 30/min, inspect 120/min, sizing chat 30/min; configurable via env).
- **Audit logs** — JSON `copilot-guard` events for chat, inspect, index, and validation failures (no message bodies).
- **Docs** — [docs/25-copilot-security.md](docs/25-copilot-security.md) threat model, limits, and verification.

### Verification

- `npm test -- src/copilot/copilotRequestGuard.test.ts src/server/copilotRateLimit.test.ts src/server/copilotRoutes.test.ts`
- POST forged `system` message to `/api/copilot/chat` → HTTP 400

---

## hvyMETL 4.2.20

**Grove API documentation** — new [docs/24-grove-api.md](docs/24-grove-api.md) audit covering Migration Studio Grove usage (Copilot + sizing), security, error handling, test coverage, and hardening recommendations. Cross-linked from [docs/19-llm-and-models.md](docs/19-llm-and-models.md), [docs/20-agent-copilot.md](docs/20-agent-copilot.md), and [docs/21-sizing-assistant.md](docs/21-sizing-assistant.md).

---

## hvyMETL 4.2.19

**Run Full Pipeline dialect label** — the pipeline environment banner now shows the imported schema dialect (MySQL, Oracle, DynamoDB, etc.) instead of always defaulting to PostgreSQL when the session dialect was never changed from its initial value.

### Highlights

- **`dialectFromModelSource`** — reads dialect from `ddl:{id}` and `example:…` model source labels.
- **`inferSchemaDialect`** — prefers the imported model source over the UI session default.
- **Migration Studio** — pipeline panel uses the resolved dialect for the `{dialect} → Atlas` banner and CSV hints.

### Verification

- `npm test -- src/dialects.test.ts`
- Load a non-PostgreSQL example (e.g. MySQL or DynamoDB) and open **Run Full Pipeline** — banner should match the import dialect.

---

## hvyMETL 4.2.18

**Examples catalog documentation** — [`examples/README.md`](examples/README.md) now documents all four Amazon DynamoDB CloudFormation Load examples (IoT, CMS Platform, Ecommerce Catalog, Orders), fixes the enterprise example count (11), and links GSI migration guidance from the pattern matrix and coverage tables.

### Highlights

- **Amazon DynamoDB section** — resource names, GSI counts, suggested profiles, and CLI load commands.
- **Pattern matrix** — bucket/time-series/polymorphic rows for DynamoDB and dialect demos.
- **Cross-links** — [`docs/10-examples.md`](docs/10-examples.md) quick reference for DynamoDB picker entries.

### Verification

- `npm test -- src/server/builtinExamples.test.ts`
- Confirm [`examples/README.md`](examples/README.md) Load example catalog matches `listBuiltinExamples()` (42 entries)

---

## hvyMETL 4.2.17

**DynamoDB GSI → MongoDB migration helpers** — new utility maps `INCLUDE` GSI projections to MongoDB compound indexes (covered queries) and Atlas Search `storedSource` definitions, with PascalCase → camelCase field renaming aligned to migration plans.

### Highlights

- **`dynamoGsiMongoMigration`** — `buildMongoCompoundIndexFromGsi`, `buildMongoCoveredFindFromGsi`, `buildAtlasSearchIndexFromGsi` for CloudFormation GSI metadata.
- **CMS moderation example** — `GSI2-Author-Moderation-Index` covered in unit tests and [docs/20-dynamodb-gsi-mongodb-migration.md](docs/20-dynamodb-gsi-mongodb-migration.md).
- **Load example naming** — all DynamoDB picker entries use the `Amazon DynamoDB (CloudFormation) - …` prefix; legacy Mobile dialect label removed.
- **MongoDB diagram UX** — compact single-line collection field rows with larger type; duplicate-table controls removed from Before SQL canvas.

### Verification

- `npm test -- src/utilities/dynamoGsiMongoMigration.test.ts`
- `npm test -- src/server/builtinExamples.test.ts`
- `npm run build:ui`

---

## hvyMETL 4.2.16

**MongoDB collection diagram readability** — field rows stack name above BSON type with nowrap types and wider cards, fixing broken `string | null` wrapping on long DynamoDB GSI field names.

---

## hvyMETL 4.2.15

**Pipeline import applies DynamoDB field renaming** — flat DynamoDB collections now pass through the CSV shaper before csvToAtlas, mapping `PK`/`GSI1PK` source columns to `partitionKey`/`gSI1CategoryPriceIndex` (etc.) so Atlas documents match the MongoDB diagram.

### Verification

- `npx vitest run src/utilities/csvShaper.test.ts -t "renames DynamoDB"`

---

## hvyMETL 4.2.14

**Auto-refresh stale DynamoDB migration plans** — switching to After · MongoDB (or re-importing DynamoDB YAML) now regenerates plans that still expose legacy `gSI1PK`/`pK` fields instead of semantic GSI index names. Design API always re-parses CloudFormation DDL with the resolved dialect.

### Verification

- `npx vitest run src/utilities/dynamoPlanStale.test.ts src/design/patternSelector.test.ts -t DynamoDB`

---

## hvyMETL 4.2.13

**DynamoDB GSI fields use index names in MongoDB plans** — GSI hash keys map to camelCased GSI index names (e.g. `GSI1-Category-Price-Index` → `gSI1CategoryPriceIndex`) instead of generic `gSI1PK`; range keys append `SortKey`. Table PK/SK become `partitionKey` / `sortKey`.

### Verification

- `npx vitest run src/utilities/mongoFieldNaming.test.ts src/design/patternSelector.test.ts -t DynamoDB`

---

## hvyMETL 4.2.12

**DynamoDB CloudFormation diagram layout** — DynamoDB imports now render grouped primary-key, GSI, and TTL sections with capability chips (billing mode, streams, PITR, SSE) instead of squeezing long `(GSI … HASH)` labels into SQL-style rows.

### Highlights

- **Structured parser metadata** — GSIs include projection type and `NonKeyAttributes`; table-level billing, stream, TTL, PITR, and SSE settings attach to `table.dynamoDb`.
- **Readable table cards** — wider DynamoDB nodes with grid rows (`attribute | type | HASH/RANGE`) and section headers per index.
- **SQL tables unchanged** — column-type wrapping improved so long SQL types no longer force character-by-character name breaks.

### Verification

- `npx vitest run src/utilities/dynamodbCloudFormationParser.test.ts web/src/dynamoTableDisplay.test.ts`

---

## hvyMETL 4.2.11

**Custom workload modal seeds from active profile** — opening Custom Workload now pre-fills read/write ratio, RPM, growth, and driver tuning from the currently selected preset (e.g. E-commerce Catalog 95:5) instead of a fixed 80:20 default.

### Verification

- `npx vitest run web/src/customProfileShared.test.ts`

---

## hvyMETL 4.2.10

**Architecture Review production checklist + schema type enrichment** — collective reviews now require cardinality tables, multikey index warnings, concurrency/pagination guidance, and inspect schema merges migration-plan `$jsonSchema` types instead of showing `unknown`.

### Highlights

- **BSON type unknown fix** — `describeMongoCollectionSchema` merges migration-plan field types when MCP inference returns empty/unknown definitions; supports analyzer `fields[]` payloads.
- **Production readiness prompt** — parallel array multikey warning, document size projections, Extended Reference refresh, `maxItems`/`additionalProperties`, optimistic locking, security/pagination/shard contingency.
- **Richer schema context** — relationships include avg/max cardinality and embed-direction flags for review grounding.

### Verification

- `npx vitest run src/copilot/mongoSchemaFormat.test.ts src/copilot/copilotArchitecturePrompt.test.ts`

---

## hvyMETL 4.2.9

**Reverse-embedded lookup objects omit absorbed collection primary keys** — when a lookup table is eliminated (e.g. `paints → cars`), nested `paint` payloads no longer include `paintId`; only semantic fields (`colorName`, `paintCode`, etc.) remain.

### Highlights

- **Migration plan schema** — `$jsonSchema` on reverse-embedded objects excludes the absorbed table's PK columns.
- **CSV + ETL shaping** — nested JSON objects and SQLite `json_object` expressions drop the lookup id for reverse embeds.
- **Host document** — the FK scalar (`paintId` on `cars`) was already omitted; nested objects now match that shape.

### Verification

- `npx vitest run src/design/patternSelector.test.ts src/utilities/csvShaper.test.ts src/etl/shaper.test.ts -t reverse-embed`

---

## hvyMETL 4.2.8

**Architecture Review export restored after inspect tools** — collective post-import reviews are no longer suppressed as duplicate inspect listings, so **Save to Google Docs** and **Download markdown** appear again on the full review response.

### Highlights

- **Never suppress architecture reviews** — comparison and index tables in `# {db} — Architecture Review` responses no longer match inspect-echo heuristics.
- **Heading detection** — accepts em dash, en dash, and hyphen title variants for export buttons.
- **Tool-loop headroom** — copilot tool iterations increased to 10 for inspect-heavy review turns; shows a recovery hint if the written review still does not appear.

### Verification

- `npx vitest run web/src/copilot/inspectCommandRouting.test.ts src/copilot/architectureReviewExport.test.ts`

---

## hvyMETL 4.2.7

**Entity tables with multiple FKs no longer collapse as junction links** — `cars` and similar hosts stay as top-level collections when they reference several lookups, so reverse embed overrides (`paints → cars`, `wheels → cars`, `lights → cars`) produce a `cars` collection instead of folding everything into `manufacturers`.

### Highlights

- **Junction detection fix** — empty payload no longer vacuously marks every two-FK table as a junction; link tables like `page_tags` still fold, but entity tables like `cars` do not.
- **Reverse-embed host guard** — tables that host developer reverse-embedded documents are never absorbed into a parent via force-embed, bounded embed, or junction folding.
- **Reversed relationship skip** — parent-side planning ignores `embedDirectionReversed` relationships so lookups embed into the host (`cars.paint`) rather than the host folding into the lookup.
- **Nested CSV shaping** — reverse-embedded lookup objects resolve correctly when intermediate tables remain nested in shaped CSV output.

### Verification

- `npx vitest run src/design/patternSelector.test.ts src/utilities/csvShaper.test.ts`

---

## hvyMETL 4.2.6

**Reverse-embedded objects include nested field schema** — `paint`, `wheel`, and similar reverse-embed fields now carry full `$jsonSchema` properties (`colorName`, `paintCode`, `finishType`, etc.) instead of a bare `object` type.

### Verification

- `npx vitest run src/design/patternSelector.test.ts`

---

## hvyMETL 4.2.5

**Reverse-embedded lookup tables are absorbed** — when you flip embed direction so lookups nest inside the host (e.g. `paints → cars`), standalone `paints` / `wheels` / `lights` collections are no longer emitted.

### Highlights

- **Absorb embedded parent** — reverse force-embed marks the guest lookup table as absorbed, same as forward embed absorbs the child; only the host collection (`cars`) is imported.
- **Multi-lookup hosts** — reversing several FKs into one host (paint, wheel, light into cars) yields a single collection with nested objects.

### Verification

- `npx vitest run src/design/patternSelector.test.ts src/server/runDesign.test.ts`

---

## hvyMETL 4.2.4

**Reversed embed produces full nested documents** — flipping embed direction on lookup FKs (e.g. `paints → cars`) now embeds the parent object instead of keeping a scalar id plus Extended Reference fields.

### Highlights

- **Full reverse embed** — when embed direction is reversed, the FK column is omitted from the host document and the referenced parent is emitted as a nested object (`paint`, `model`, etc.).
- **No duplicate Extended Reference** — reverse-embedded FKs skip the partial `paint.colorName` dotted-column pattern so the document shape matches a true embed.
- **ETL + CSV pipeline** — SQLite shaper and CSV shaper both drop the FK scalar and emit the nested JSON object.

### Verification

- `npx vitest run src/design/patternSelector.test.ts src/etl/shaper.test.ts src/server/runDesign.test.ts`

---

## hvyMETL 4.2.3

**Copilot Architecture Review resilience** — pre-flight Atlas collection checks and safe JSON parsing so reviews complete when plan collections are folded or the Grove gateway returns HTML.

### Highlights

- **Collection pre-flight** — Mongo inspect tools verify the collection exists in the target physical database before `collection-indexes` / schema / aggregate calls; errors list live Atlas collections and migration-plan hints when a name was folded.
- **Safe Grove/API parsing** — `groveChat` and `sendCopilotChat` parse response bodies as text first so HTML error pages (502/gateway) surface clear errors instead of `Unexpected token '<'`.
- **Architecture Review prompts** — Copilot is instructed to call `listMongoCollections` once and only inspect live collections; continue the review when a single inspect call fails.

### Verification

- `npx vitest run src/copilot/groveChat.test.ts src/copilot/mongoInspectService.test.ts src/copilot/copilotArchitecturePrompt.test.ts`

---

## hvyMETL 4.2.2

**Embed direction toggle** — flip which collection hosts a forced embed in **Embed Overrides**.

### Highlights

- **Arrow control** — click **→** between linked tables to reverse embed direction (e.g. embed parent `cars` inside child `paints` instead of folding `paints` into `cars`).
- **Design + pipeline** — reversed embeds emit a nested document on the child collection via `reverseJoin` in the migration plan and ETL shaper.

### Verification

- `npm test -- web/src/cardinalityOverrides.test.ts src/design/patternSelector.test.ts src/server/runDesign.test.ts`

---

## hvyMETL 4.2.1

**Fix hosted Swagger** — [https://hvymetl.studio/api/docs](https://hvymetl.studio/api/docs) no longer lands on a blank SPA after login.

### Highlights

- **Same-tab return** — unauthenticated HTML visits redirect to `/?swaggerAuthReturn=…`; the studio bootstraps the swagger session cookie and navigates back to `/api/docs` (popup fallback if blocked).
- **Platform OpenAPI fallback** — Swagger always renders; tenants without design/pipeline artifacts see the Studio platform API spec via [`studioPlatformOpenApi.ts`](src/server/studioPlatformOpenApi.ts).

### Verification

- `npm test -- src/server/apiArtifactRoutes.test.ts src/server/auth.test.ts src/server/studioPlatformOpenApi.test.ts`

---

## hvyMETL 4.2.0

**Studio scheduled reflection jobs** — Manager View UI to create, start, stop, and destroy hourly/daily/weekly ML reflection schedules on the API server.

### Highlights

- **`/api/reflection-jobs`** — tenant-scoped CRUD + start/stop; jobs persist in `hvymetl_reflection_jobs`.
- **In-process scheduler** — hydrates running jobs on API startup; each tick reflects `pending_reflection` logs after job soak (`reflectPendingMigrationLogs`).
- **Manager UI** — **Configure → Lessons learned — scheduled reflection** ([`ManagerReflectionJobsPanel.tsx`](web/src/components/ManagerReflectionJobsPanel.tsx)).

### Verification

- `npm test -- src/ml_engine/reflectionJobs.test.ts src/routes/reflectionJobRoutes.test.ts`

---

## hvyMETL 4.1.0

Release **4.0 Phase 3** — **live Atlas metrics** for the ML lessons-learned feedback loop.

### Highlights

- **`AtlasApiMetricsConnector`** — Performance Advisor slow query counts, process cache/IOPS measurements, `source: atlas-api` ([`atlasApiMetrics.ts`](src/ml_engine/atlasApiMetrics.ts)).
- **Bootstrap** — API server and CLI register the live connector when `ATLAS_CLIENT_ID` / `ATLAS_CLIENT_SECRET` / `ATLAS_GROUP_ID` and `HVYMETL_ATLAS_CLUSTER_ID` are set; `HVYMETL_ATLAS_STUB_MODE` still forces stub metrics for local dev.
- **Migration log correlation** — optional `atlasCorrelation` on `hvymetl_migration_logs` (target database/collection, project id, process id, observation window).
- **Deferred reflection** — `HVYMETL_REFLECTION_DELAY_MS` soak before pipeline `scheduleReflection`; **`hvymetl reflect --migration-id`** for cron operators.

### Verification

- `npm test -- src/ml_engine/atlasApiMetrics.test.ts src/ml_engine/feedback_loop.test.ts`

---

## hvyMETL 4.0.9

Architecture reviews recommend **Atlas Search** vs **Atlas Vector Search** from migration-plan field names, with hybrid search guidance in §6.

### Highlights

- **Field heuristics** — `product_name`, `title`, `sku` → Atlas Search **autocomplete**; `description`, `summary`, `body` → **Vector Search (autoEmbed)**; category/brand/tags → faceted lexical search ([`architectureReviewSearchRecommendations.ts`](src/copilot/architectureReviewSearchRecommendations.ts)).
- **Copilot context** — after **Refresh design**, **Search field hints** inject into the system prompt from each collection’s string fields.
- **§6 template** — Atlas Search vs Vector Search use cases, per-collection **Search strategy** tables, and **hybrid** `$search` + `$vectorSearch` / RRF when both field classes exist ([`docs/20-agent-copilot.md`](docs/20-agent-copilot.md)).

### Verification

- `npm test -- src/copilot/architectureReviewSearchRecommendations.test.ts src/copilot/copilotArchitecturePrompt.test.ts web/src/copilot/schemaContext.test.ts`

---

## hvyMETL 4.0.8

Structured **§8 MongoDB Atlas cluster sizing** in architecture reviews (working set, M40 vs M50, storage table, replica set & backup, sharding verdict, validation) grounded in Manager dataset scale.

### Verification

- `npm test -- src/copilot/copilotArchitecturePrompt.test.ts`

---

## hvyMETL 4.0.7

Schema import **supported dialects** list uses a two-column **hover popover** instead of a long inline list.

---

## hvyMETL 4.0.6

Schema import removes the manual **dialect dropdown**; dialect is **auto-detected** from pasted DDL with a read-only supported-dialects reference in the UI.

---

## hvyMETL 4.0.5

- **`detectDialect()`** — automatic SQL dialect detection on schema import (22 dialects).
- **Atlas Sizing assistant** — multi-cloud provider context and **`oplogRecommendation`** on tier tool output.

### Verification

- `npm test -- src/utilities/detectDialect.test.ts`

---

## hvyMETL 4.0.4

**Atlas Sizing** recommendation replies support **Save to Google Docs** and **Download markdown** (same export pattern as architecture reviews).

---

## hvyMETL 4.0.3

Fix **Atlas Sizing** studio seed module import and TypeScript build for `SizingAssistantSession`.

---

## hvyMETL 4.0.2

**Atlas Sizing** tab can seed session parameters from Migration Studio **Manager** sliders, workload profile, and Atlas inspect context.

---

## hvyMETL 4.0.1

Fix Atlas Sizing assistant parameter persistence when the model sends aliases, string numbers, or nested `parameters` objects.

- **`parseSizingParameterUpdate`** — maps `cluster_data_size_gb`, `peak_read_qps`, etc. to canonical engine fields; coerces `"5,000"` strings.
- **Chat supplement** — `find_optimal_cluster_tier` / `update_sizing_parameters` backfill missing required fields from recent user messages (e.g. `5,000 GB`, `400 qts` typo).
- **Tool responses** — include `missingFields` and `X/4 required fields set` for clearer LLM turns.

### Verification

- `npm test -- src/copilot/sizingAssistantParameterParse.test.ts src/copilot/sizingAssistantTools.test.ts`

---

## hvyMETL 4.0.0

Release **4.0** ships the **Atlas cluster sizing assistant** runtime (engine, tools, API, Migration Studio tab). Multi-phase work continues for connectivity architect runtime and production lessons learned — see [`docs/22-release-4.0-roadmap.md`](docs/22-release-4.0-roadmap.md).

### Highlights

- **Sizing engine** — Logic Abstract tier catalog (M30–M300), shard/secondary math, ranking ([`src/copilot/sizingEngine.ts`](src/copilot/sizingEngine.ts)).
- **API** — `/api/sizing-assistant` session, tools, and Grove chat with pricing stripped from client payloads.
- **Studio** — Agent Copilot → **Atlas Sizing** tab ([`web/src/components/sizing/SizingAssistantPanel.tsx`](web/src/components/sizing/SizingAssistantPanel.tsx)).
- **Prompts (Phase 1)** — Sizing assistant + connectivity architect system prompts.

### Verification

- `npm test -- src/copilot/sizingEngine.test.ts src/copilot/sizingAssistantTools.test.ts src/routes/sizingAssistantRoute.test.ts`
- `npm run build`
- `npm run build --prefix web`

---

## hvyMETL 4.0.0 (in development)

<details>
<summary>Earlier 4.0 development notes (superseded by release above)</summary>

Multi-phase release: **Atlas sizing assistant**, **connectivity & security architect**, and **production ML lessons learned**. Full plan: [`docs/22-release-4.0-roadmap.md`](docs/22-release-4.0-roadmap.md).

</details>

---

## hvyMETL 3.2.4

Diagram **View** control for comparing **Before · SQL** and **After · MongoDB** on one screen.

### Highlights

- **View dock (canvas top-left):** pill selector with **stacked split** (SQL above MongoDB), **side-by-side split** (SQL left, MongoDB right), **REL** (SQL-only), and **MDB** (MongoDB-only).
- **Resizable splits:** drag the divider between panes; sizes persist in session (`diagramDualSplitBottomHeight`, `diagramDualSplitLeftWidth`).
- **Workflow integration:** **Import DDL → Before · SQL** / **After · MongoDB** steps switch to **REL** / **MDB**; split modes auto-run **Refresh design** when a migration plan is missing.
- **Session:** `diagramViewMode` restored on refresh alongside existing `schemaPhase`.

### Verification

- `npm test -- web/src/diagramViewMode.test.ts`
- `npm run build --prefix web` (after `npm install --prefix web`)

---

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
