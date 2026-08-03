# Atlas cluster sizing assistant (Release 4.0)

The **sizing assistant** is a dedicated agent flow for MongoDB Atlas cluster sizing: it collects workload parameters, optionally extracts them from curated meeting transcripts, runs the sizing engine, and presents tier recommendations without exposing raw pricing breakdowns in chat.

**Release 4.0 scope** also includes production **lessons learned** (live Atlas metrics + vector retrieval). Phase breakdown: [22-release-4.0-roadmap.md](22-release-4.0-roadmap.md).

## Architecture (Phase 2 runtime)

| Module | Purpose |
| --- | --- |
| [`src/copilot/sizingAssistantPrompt.ts`](../src/copilot/sizingAssistantPrompt.ts) | System prompt (Phase 1) |
| [`src/copilot/sizingEngine.ts`](../src/copilot/sizingEngine.ts) | Logic Abstract Sections 1–10 + M30–M300 tier catalog |
| [`src/copilot/sizingAssistantSession.ts`](../src/copilot/sizingAssistantSession.ts) | In-memory session store (parameters, shard penalty, curator handoff, chat buffer) |
| [`src/copilot/sizingAssistantToolSchemas.ts`](../src/copilot/sizingAssistantToolSchemas.ts) | OpenAI function definitions |
| [`src/copilot/sizingAssistantTools.ts`](../src/copilot/sizingAssistantTools.ts) | Tool handlers |
| [`src/copilot/sizingAssistantChat.ts`](../src/copilot/sizingAssistantChat.ts) | Grove chat + server-side tool loop |
| [`src/copilot/sizingAssistantPresentation.ts`](../src/copilot/sizingAssistantPresentation.ts) | Strip pricing from tool/assistant payloads |
| [`src/routes/sizingAssistantRoute.ts`](../src/routes/sizingAssistantRoute.ts) | HTTP API (`/api/sizing-assistant`) |

The sizing engine is **not** shared with Manager View heuristics in `web/src/managerCostEstimate.ts`.

## Environment

Uses the same Grove settings as Migration Agent Copilot:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROVE_API_KEY` | For `/chat` | Grove OpenAI-compatible gateway |
| `GROVE_API_URL` | No | Override chat completions URL |
| `GROVE_MODEL` | No | Model id (default `gpt-5.6-luna`) |

Studio routes require authenticated roles `admin` or `developer` (same as `/api/copilot`).

## HTTP API

Base path: **`/api/sizing-assistant`** (mounted in [`src/server/index.ts`](../src/server/index.ts)).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/status` | `{ configured, model }` — Grove configured when `GROVE_API_KEY` is set |
| `POST` | `/session` | Create session; optional body `{ studioSeed }` pre-fills parameters from Studio (Manager scale, workload profile, Atlas inspect hints) |
| `POST` | `/session/:sessionId/seed` | Body `{ studioSeed }` — merge Studio context into an existing session (fills only missing fields) |
| `GET` | `/session/:sessionId` | Session snapshot (parameters, handoff status) |
| `PUT` | `/session/:sessionId/transcripts` | Body: `{ transcripts: [{ id, title, body }] }` |
| `POST` | `/tools` | Body: `{ sessionId, tool, args? }` — direct tool execution |
| `POST` | `/chat` | Body: `{ sessionId, messages, maxToolRounds? }` — Grove turn with tool loop |

### Tool execution example

```bash
SESSION=$(curl -s -X POST http://localhost:3847/api/sizing-assistant/session | jq -r .sessionId)

curl -s -X POST http://localhost:3847/api/sizing-assistant/tools \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION\",\"tool\":\"update_sizing_parameters\",\"args\":{
    \"projected_total_data_size_gb\":400,
    \"total_raw_read_ops\":4000,
    \"total_raw_write_ops\":1500,
    \"avg_doc_size_kb\":2.5
  }}"

curl -s -X POST http://localhost:3847/api/sizing-assistant/tools \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION\",\"tool\":\"find_optimal_cluster_tier\",\"args\":{}}"
```

Responses from `/tools` and `/chat` **omit** `finalHourlyCost` and related pricing fields in JSON returned to clients. The engine still ranks tiers internally using hourly cost.

## Tools

| Tool | Handler behavior |
| --- | --- |
| `update_sizing_parameters` | Merge partial cluster-level fields into session |
| `update_shard_penalty` | Set `shard_penalty_multiplier` (≥ 1.0) |
| `abort_sizing_process` | Clear parameters, transcripts, and chat buffer |
| `handoff_to_resource_curator` | Set handoff `pending`; return curator payload |
| `get_session_transcripts` | List attached transcripts (preview text) |
| `extract_sizing_from_transcripts` | Heuristic parse → merge into parameters |
| `find_optimal_cluster_tier` | Run sizing engine; return ranked recommendations |
| `prompt_for_missing_info` | Required fields: data GB, read ops, write ops, avg doc KB |

## Migration Studio UI

Open **Agent Copilot** (⌘K) → **Atlas Sizing** tab.

| File | Role |
| --- | --- |
| [`web/src/sizing/SizingAssistantContext.tsx`](../web/src/sizing/SizingAssistantContext.tsx) | Session + chat state; calls `/api/sizing-assistant` |
| [`web/src/components/sizing/SizingAssistantPanel.tsx`](../web/src/components/sizing/SizingAssistantPanel.tsx) | Thread, quick prompts, tool result summaries |
| [`web/src/components/sizing/SizingRecommendationExport.tsx`](../web/src/components/sizing/SizingRecommendationExport.tsx) | **Save to Google Docs** + **Download markdown** on recommendation replies |

Requires `GROVE_API_KEY` on the API server for LLM-driven tool use; `/tools` works without Grove for deterministic testing.

Recommendation responses (for example **Recommended Cluster**, **Oplog Recommendations**, capacity tables, or after `find_optimal_cluster_tier`) show the same **Export** actions as architecture reviews when `GOOGLE_DRIVE_CLIENT_ID` is configured — see [Agent Copilot → Google Docs](20-agent-copilot.md#architecture-review--google-docs).

## UX flow

1. Studio opens **Atlas Sizing** → `POST /session` with `studioSeed` built from Manager **Dataset scale**, migration workload profile (peak RPM, read/write split, compression), post-design document size, and optional Atlas inspect hints after pipeline import (`listMongoCollections` / index listings). Clients may still attach **transcripts** after Resource Curator selection via `PUT /session/:id/transcripts`.
2. User chats via **`/chat`** (Grove + tools) or the studio **Atlas Sizing** tab. Studio re-posts `studioSeed` on `/seed` when Manager or inspect context changes, and includes it on `/chat` so the model sees pre-loaded facts.
3. Model calls `update_sizing_parameters` only when the user changes values; `find_optimal_cluster_tier` can run immediately when required fields were seeded.
4. When ready, `find_optimal_cluster_tier` returns tier id, shard count, secondaries, and **parameters used** — no cost breakdown in assistant-facing text.
5. `handoff_to_resource_curator` pauses sizing until new resources are selected (`PUT` transcripts marks handoff `completed`).

## Behavioral notes (prompt)

- **Cluster-level only:** aggregate per-collection inputs with an explicit note.
- **Unsupported topology/features:** acknowledge 3-node RS / `us-east-1` / AWS defaults while still setting HA/geo flags where applicable.
- **After calculation:** include parameters used; do **not** surface hourly cost or total pricing in chat.

## Verification

```bash
npm test -- src/copilot/sizingEngine.test.ts
npm test -- src/copilot/sizingAssistantTools.test.ts
npm test -- src/routes/sizingAssistantRoute.test.ts
npm test -- src/copilot/sizingAssistantPrompt.test.ts src/copilot/sizingAssistantPrompt.snapshot.test.ts
```

See also [Agent Copilot](./20-agent-copilot.md) (migration studio, separate agent).

## Release 4.0 phases

| Phase | Status |
| --- | --- |
| **1** — Prompts | Shipped |
| **2** — Sizing runtime (API, engine, tools, studio tab) | Shipped |
| **3–4** — Lessons learned | Planned — [roadmap](22-release-4.0-roadmap.md) |
| **5** — 4.0.0 tag | When scope complete |

Connectivity & security: [23-atlas-connectivity-architect.md](23-atlas-connectivity-architect.md).
