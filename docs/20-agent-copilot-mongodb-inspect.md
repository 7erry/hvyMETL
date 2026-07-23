# Agent Copilot — MongoDB inspect & analyze (MCP)

Read-only Atlas inspection and analysis tools for the **Agent Copilot** sidebar. The hvyMETL API proxies requests to a co-hosted [MongoDB MCP Server](https://github.com/mongodb-js/mongodb-mcp-server) over streamable HTTP.

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

When the MCP server is down, inspect calls return HTTP 503 with a user-friendly message; the copilot header shows **Atlas inspect offline**.

## Code map

| Module | Role |
|--------|------|
| `src/copilot/mongoMcpClient.ts` | Streamable HTTP MCP client |
| `src/copilot/mongoInspectScope.ts` | Tenant prefix / logical DB mapping |
| `src/copilot/mongoInspectService.ts` | Tool dispatch + response sanitization |
| `src/copilot/mongoAnalyzePipeline.ts` | Read-only aggregation pipeline guards |
| `src/copilot/mongoAnalyzeComparison.ts` | Plan vs Atlas comparison rows |
| `src/copilot/mongoPlanContext.ts` | Migration plan snapshot parsing |
| `src/copilot/mongoInspectToolSchemas.ts` | OpenAI tool definitions |
| `src/server/copilotRoutes.ts` | `/api/copilot/mongo/inspect` |
| `web/src/components/copilot/MongoAnalyzeTables.tsx` | Aggregate, explain, and compare result tables |

## Verification

```bash
npm test -- src/copilot/mongoAnalyzePipeline.test.ts src/copilot/mongoAnalyzeComparison.test.ts src/copilot/mongoInspectScope.test.ts src/copilot/mongoInspectService.test.ts src/server/copilotRoutes.test.ts web/src/copilot/mongoAnalyzeFormat.test.ts
```
