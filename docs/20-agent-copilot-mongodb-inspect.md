# Agent Copilot — MongoDB inspect & analyze (MCP)

> **Overview:** guided workflow, quick chips, architecture review export, and canvas tools are documented in [20-agent-copilot.md](20-agent-copilot.md). This page covers the co-hosted MongoDB MCP proxy and inspect/analyze tools in depth.

Read-only Atlas inspection and analysis tools for the **Agent Copilot** sidebar. The hvyMETL API proxies requests to a co-hosted [MongoDB MCP Server](https://github.com/mongodb-js/mongodb-mcp-server) over streamable HTTP.

## Tools (Phase 3 — Vector index)

Phase 3 adds **write** capability for Atlas Vector Search **autoEmbed** indexes (Automated Embeddings preview). Inspect/analyze tools remain read-only via MCP; index creation uses the **MongoDB Node driver** with the same tenant URI as pipeline imports so full index options are supported (`numDimensions`, `quantization`, `similarity`).

| Surface | Method | Purpose |
|---------|--------|---------|
| Copilot UI | **Create autoEmbed vector index…** on schema/index inspect cards | Dialog: text field, Voyage model, quantization, dimensions, similarity |
| API | `POST /api/copilot/mongo/vector-index` | Same options as JSON body |

Supported **models:** `voyage-4-lite`, `voyage-4`, `voyage-4-large`, `voyage-code-3`.  
**Quantization:** `float`, `scalar`, `binary`, `binaryNoRescore`.  
**Dimensions:** `256`, `512`, `1024`, `2048`.  
**Similarity:** `cosine`, `dotProduct`, `euclidean`.

See [How to index fields for vector search (autoEmbed)](https://www.mongodb.com/docs/vector-search/index/vector-search-type/?deployment-type=atlas&embedding=auto&interface=driver&language=python#std-label-avs-types-vector-search).

## Tools (Phase 1 — Inspect)

| Copilot tool | MCP tool | Purpose |
|--------------|----------|---------|
| `listMongoDatabases` | `list-databases` | Databases owned by the signed-in user |
| `listMongoCollections` | `list-collections` | Collections in a logical database |
| `describeMongoCollectionSchema` | `collection-schema` | Inferred document schema |
| `listMongoCollectionIndexes` | `collection-indexes` | Classic + Atlas Search indexes |
| `findMongoDocuments` | `find` | Read-only find (max 25 docs) |

## Tools (Phase 2 — Analyze)

| Copilot tool | MCP tool | Purpose |
|--------------|----------|---------|
| `aggregateMongoCollection` | `aggregate` | Read-only aggregation (max 20 stages, 50 docs) |
| `explainMongoOperation` | `explain` | Query planner / execution stats for find, count, or aggregate |
| `compareMongoCollectionToPlan` | `collection-schema`, `collection-indexes`, `count` | Compare live Atlas shape vs current migration plan |

Canvas mutation tools (`foldTable`, etc.) still run in the browser. Inspect/analyze tools run **server-side** so `MONGODB_URI` never reaches the client.

### Compare to plan

`compareMongoCollectionToPlan` uses the **current migration plan** from the studio session (sent as `planContext` on `/api/copilot/mongo/inspect`). Run **Refresh design** first so field, embed, and index expectations are available.

Comparison rows:

| Status | Meaning |
|--------|---------|
| Match | Planned field or index key found in Atlas |
| Missing | Expected from plan but not inferred on cluster |
| Extra | Present in Atlas sample but not in plan |
| Warn | No plan loaded or empty collection |

## Multi-tenant isolation

Hosted users import into logical names such as `csv_to_atlas`. The server maps these to physical Atlas names (`{user}__csv_to_atlas`) using the same Auth0 display-name prefix as pipeline imports. Copilot and API responses always use **logical names**; other tenants' databases are filtered out.

## Configuration

Inspect uses the **same MongoDB URI as pipeline imports** (tenant secrets on hosted studio, or `MONGODB_URI` locally). Each inspect request opens an ephemeral MCP connection via the `connect` tool — the MCP server's global `MDB_MCP_CONNECTION_STRING` is only a fallback for local dev when no URI is configured.

```bash
# Default when unset: http://127.0.0.1:3000/mcp
HVYMETL_MCP_MONGODB_URL=http://127.0.0.1:3000/mcp
HVYMETL_MCP_MONGODB_ENABLED=1
# Must match MCP server MDB_MCP_HTTP_HEADERS when validation is enabled
HVYMETL_MCP_MONGODB_HEADERS={"x-api-key":"shared-secret"}
```

Start the MCP server on the same host (read-only recommended):

```bash
npx -y mongodb-mcp-server@latest --transport http --readOnly --httpHost=127.0.0.1 --httpPort=3000
```

## API

- `GET /api/copilot/status` — includes `mongoInspect.enabled` and `mongoInspect.available`
- `POST /api/copilot/mongo/inspect` — `{ tool, args, planContext? }` for direct invocation (used by the copilot UI). `planContext` is required for meaningful `compareMongoCollectionToPlan` results.
- `POST /api/copilot/mongo/vector-index` — create an Atlas **autoEmbed** vector search index (Phase 3). Body: `database`, `collection`, `path`, `model`, `quantization`, `numDimensions`, `similarity`, optional `name`. Uses the MongoDB driver (not read-only MCP).

When the MCP server is down, inspect calls return HTTP 503 with a user-friendly message; the copilot header shows **Atlas inspect offline**.

## Code map

| Module | Role |
|--------|------|
| `src/copilot/mongoInspectConnection.ts` | Tenant URI resolution + MCP `connect` / `disconnect` |
| `src/copilot/mongoMcpClient.ts` | Streamable HTTP MCP client |
| `src/copilot/mongoInspectScope.ts` | Tenant prefix / logical DB mapping |
| `src/copilot/mongoInspectService.ts` | Tool dispatch + response sanitization |
| `src/copilot/mongoAnalyzePipeline.ts` | Read-only aggregation pipeline guards |
| `src/copilot/mongoAnalyzeComparison.ts` | Plan vs Atlas comparison rows |
| `src/copilot/mongoPlanContext.ts` | Migration plan snapshot parsing |
| `src/copilot/mongoInspectToolSchemas.ts` | OpenAI tool definitions |
| `src/copilot/mongoVectorAutoEmbedIndex.ts` | autoEmbed index validation + definition builder |
| `src/copilot/mongoVectorIndexService.ts` | Driver-based `createSearchIndex` for tenants |
| `web/src/copilot/CopilotContext.tsx` | Routes inspect/analyze tool calls to the API |
| `src/server/copilotRoutes.ts` | `/api/copilot/mongo/inspect`, `/api/copilot/mongo/vector-index` |
| `web/src/components/copilot/MongoAutoEmbedVectorIndexModal.tsx` | autoEmbed index dialog |
| `web/src/components/copilot/MongoAnalyzeTables.tsx` | Aggregate, explain, and compare result tables |

## Verification

```bash
npm test -- src/copilot/mongoVectorAutoEmbedIndex.test.ts src/copilot/mongoAnalyzePipeline.test.ts src/copilot/mongoAnalyzeComparison.test.ts src/copilot/mongoInspectScope.test.ts src/copilot/mongoInspectService.test.ts src/server/copilotRoutes.test.ts src/server/copilotVectorIndexRoutes.test.ts web/src/copilot/mongoAnalyzeFormat.test.ts
```
