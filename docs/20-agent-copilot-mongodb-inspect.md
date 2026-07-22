# Agent Copilot — MongoDB inspect (Phase 1)

Read-only Atlas inspection tools for the **Agent Copilot** sidebar. The hvyMETL API proxies requests to a co-hosted [MongoDB MCP Server](https://github.com/mongodb-js/mongodb-mcp-server) over streamable HTTP.

## Tools (Phase 1)

| Copilot tool | MCP tool | Purpose |
|--------------|----------|---------|
| `listMongoDatabases` | `list-databases` | Databases owned by the signed-in user |
| `listMongoCollections` | `list-collections` | Collections in a logical database |
| `describeMongoCollectionSchema` | `collection-schema` | Inferred document schema |
| `listMongoCollectionIndexes` | `collection-indexes` | Classic + Atlas Search indexes |
| `findMongoDocuments` | `find` | Read-only find (max 25 docs) |

Canvas mutation tools (`foldTable`, etc.) still run in the browser. Inspect tools run **server-side** so `MONGODB_URI` never reaches the client.

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
- `POST /api/copilot/mongo/inspect` — `{ tool, args }` for direct invocation (used by the copilot UI)

When the MCP server is down, inspect calls return HTTP 503 with a user-friendly message; the copilot header shows **Atlas inspect offline**.

## Code map

| Module | Role |
|--------|------|
| `src/copilot/mongoMcpClient.ts` | Streamable HTTP MCP client |
| `src/copilot/mongoInspectScope.ts` | Tenant prefix / logical DB mapping |
| `src/copilot/mongoInspectService.ts` | Tool dispatch + response sanitization |
| `src/copilot/mongoInspectToolSchemas.ts` | OpenAI tool definitions |
| `src/server/copilotRoutes.ts` | `/api/copilot/mongo/inspect` |
| `web/src/copilot/CopilotContext.tsx` | Routes inspect tool calls to the API |

## Verification

```bash
npm test -- src/copilot/mongoInspectScope.test.ts src/copilot/mongoInspectService.test.ts src/server/copilotRoutes.test.ts
```
