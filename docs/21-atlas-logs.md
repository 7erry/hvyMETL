# 21 — MongoDB Atlas Logs

Sources: [`src/utilities/atlasLogs.ts`](../src/utilities/atlasLogs.ts), [`src/server/atlasLogsRoutes.ts`](../src/server/atlasLogsRoutes.ts), [`web/src/components/ManagerAtlasLogsPanel.tsx`](../web/src/components/ManagerAtlasLogsPanel.tsx)

## 1. Overview

hvyMETL integrates the **MongoDB Atlas Admin API v2** so managers can review recent
project activity and (optionally) preview mongod/mongos log lines without leaving
Migration Studio.

| Capability | Atlas API | UI |
| --- | --- | --- |
| **Project events** | `GET /api/atlas/v2/groups/{groupId}/events` | Manager sidebar → **Atlas Logs** |
| **Database logs** | `GET /api/atlas/v2/groups/{groupId}/clusters/{hostName}/logs/{logName}.gz` | Last N lines of `mongodb.gz` (gzip decompressed server-side) |
| **OAuth token** | `POST /api/oauth/token` (service account) | Cached ~1 hour on the API server |

## 2. Environment variables

Set these on the **API server** `.env` (never commit secrets):

| Variable | Required | Purpose |
| --- | --- | --- |
| `ATLAS_CLIENT_ID` | yes | Atlas service account client id (`mdb_sa_id_…`) |
| `ATLAS_CLIENT_SECRET` | yes | Service account secret (`mdb_sa_sk_…`) |
| `ATLAS_GROUP_ID` | yes | Atlas **Project ID** (group id) |
| `ATLAS_NODE_HOSTNAME` | no | Shard/host FQDN for log download, e.g. `cluster0-shard-00-00.abc12.mongodb.net` |

Create a service account in Atlas: **Access Manager → Service Accounts → Add Service Account**.
Grant access to the target project (Project Cluster Log Viewer or Project Owner).

Requests use versioned `Accept` headers (`application/vnd.atlas.2025-02-19+json` for events,
`application/vnd.atlas.2025-03-12+gzip` for log downloads) against `https://cloud.mongodb.com/api/atlas/v2/…`.

## 3. API routes

All routes require the same roles as Manager View (`admin`, `developer`, or `manager` when auth is enabled).

| Route | Description |
| --- | --- |
| `GET /api/atlas/logs/status` | `{ configured, hasHostName, groupIdMasked }` |
| `GET /api/atlas/logs/events?itemsPerPage=20&pageNum=1` | Recent project audit/activity events |
| `GET /api/atlas/logs/database?logName=mongodb.gz&maxLines=100` | Decompressed log tail (requires `ATLAS_NODE_HOSTNAME`) |
| `GET /api/atlas/logs/snapshot` | Combined status + events + optional database log preview |

Example:

```bash
curl http://localhost:3847/api/atlas/logs/status
curl "http://localhost:3847/api/atlas/logs/snapshot?itemsPerPage=10&maxLogLines=20"
```

## 4. Manager UI

In **Manager View**, open the sidebar panel **Atlas Logs**:

1. **Refresh logs** pulls a snapshot from the API server.
2. **Recent project events** lists `eventTypeName`, timestamp, and hostname when present.
3. When `ATLAS_NODE_HOSTNAME` is set, a **Database log preview** shows the last lines of `mongodb.gz`.

If credentials are missing, the panel explains which `.env` variables to add.

## 5. Security notes

- Service account secrets live only in server `.env` (gitignored).
- The UI never receives client id/secret; only masked project id and log content.
- OAuth tokens are cached in memory on the API process and refreshed before expiry.

## 6. Testing

Unit tests mock `fetch` and gzip payloads:

```bash
npm test -- src/utilities/atlasLogs.test.ts src/server/atlasLogsRoutes.test.ts
```
