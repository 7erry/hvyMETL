# Release 4.0 — multi-phase roadmap

Release **4.0** expands hvyMETL in two tracks that share Atlas credentials and memory
database patterns but serve different user flows:

| Track | Goal |
| --- | --- |
| **Sizing assistant** | Conversational Atlas cluster sizing (parameters, transcripts, tier engine, architecture briefs) |
| **Connectivity & security architect** | PrivateLink/PSC, IP access, IAM/RBAC, IaC, DNS validation & troubleshooting |
| **ML lessons learned (production)** | Replace stub post-migration metrics and in-process lesson retrieval with live Atlas data and `$vectorSearch` |

Package version remains **3.2.x** until Phase 5 ships; [`RELEASE.md`](../RELEASE.md) documents progress under **4.0.0 (in development)**.

```mermaid
flowchart LR
  P1[Phase 1 Prompts]
  P2[Phase 2 Sizing runtime]
  P3[Phase 3 Live Atlas metrics]
  P4[Phase 4 Lessons vector search]
  P5[Phase 5 Release 4.0.0]
  P1 --> P2
  P1 -.-> P3
  P3 --> P4
  P2 --> P5
  P4 --> P5
```

Phases 2 and 3–4 can proceed in parallel after Phase 1.

---

## Phase 1 — Release 4.0 assistant prompts ✅ (foundation shipped)

**Status:** System prompts are in the repo; no dedicated studio runtime yet.

### Sizing assistant

| Item | Location |
| --- | --- |
| Tool-use + presentation rules | [`src/copilot/sizingAssistantPrompt.ts`](../src/copilot/sizingAssistantPrompt.ts) |
| Sizing engine **Logic Abstract** | [`src/copilot/sizingAssistantLogicReference.ts`](../src/copilot/sizingAssistantLogicReference.ts) |
| Infrastructure Architect brief template | [`src/copilot/sizingAssistantInfrastructureFramework.ts`](../src/copilot/sizingAssistantInfrastructureFramework.ts) |
| Docs | [21-sizing-assistant.md](21-sizing-assistant.md) |

**Verification:** `npm test -- src/copilot/sizingAssistantPrompt.test.ts`

### Connectivity & security architect

| Item | Location |
| --- | --- |
| Private connectivity, IAM/RBAC, IaC, troubleshooting framework | [`src/copilot/atlasConnectivityArchitectFramework.ts`](../src/copilot/atlasConnectivityArchitectFramework.ts) |
| Composed system prompt | [`src/copilot/atlasConnectivityArchitectPrompt.ts`](../src/copilot/atlasConnectivityArchitectPrompt.ts) |
| Docs | [23-atlas-connectivity-architect.md](23-atlas-connectivity-architect.md) |

**Verification:** `npm test -- src/copilot/atlasConnectivityArchitectPrompt.test.ts`

---

## Phase 2 — Assistant runtime (sizing + connectivity)

**Goal:** Wire Release 4.0 prompts to stateful chat flows, optional tool schemas, and studio entry points.

### Sizing assistant runtime ✅ (API + engine shipped)

| Deliverable | Location |
| --- | --- |
| Session store | [`sizingAssistantSession.ts`](../src/copilot/sizingAssistantSession.ts) |
| Tool schemas + handlers | [`sizingAssistantToolSchemas.ts`](../src/copilot/sizingAssistantToolSchemas.ts), [`sizingAssistantTools.ts`](../src/copilot/sizingAssistantTools.ts) |
| Sizing engine | [`sizingEngine.ts`](../src/copilot/sizingEngine.ts) |
| Grove tool loop | [`sizingAssistantChat.ts`](../src/copilot/sizingAssistantChat.ts) |
| HTTP API | [`sizingAssistantRoute.ts`](../src/routes/sizingAssistantRoute.ts) → `/api/sizing-assistant` |

**Remaining (optional):** Resource Curator UI integration for transcript attach.

**Studio:** Copilot → **Atlas Sizing** tab (`web/src/components/sizing/SizingAssistantPanel.tsx`).

**Exit criteria (sizing):** Met via `/tools` and `/chat` — parameters collected, `find_optimal_cluster_tier` returns recommendations without pricing in API payloads.

### Connectivity architect runtime

1. **Grove / API preset** — `buildAtlasConnectivityArchitectSystemPrompt()` ([23-atlas-connectivity-architect.md](23-atlas-connectivity-architect.md)).
2. **Optional tools** — validate IP access list, export Terraform skeleton, link to Atlas Admin API patterns from [21-atlas-logs.md](21-atlas-logs.md).
3. **Studio entry** — enterprise setup wizard or Copilot mode switch (same auth/MCP boundaries as migration copilot).

**Exit criteria (connectivity):** User can describe cloud/region/VPC/auth inputs and receive structured setup, IaC snippets, and validation commands per the framework.

---

## Phase 3 — Live Atlas metrics (lessons learned feedback loop) ✅

**Goal:** Replace default [`StubAtlasMetricsConnector`](../src/ml_engine/feedbackCollector.ts) with production metrics for [`analyzeAndReflect()`](../src/ml_engine/feedbackCollector.ts) while keeping the stub for local dev.

**Status:** Shipped in **4.1.0** (live Atlas metrics) and **4.2.0** (Studio scheduled jobs UI + `/api/reflection-jobs`).

**Prerequisites**

- `MONGODB_URI` + `HVYMETL_MEMORY_DB` for durable logs/lessons ([17-ml-engine.md](17-ml-engine.md)).
- Atlas Admin API: reuse OAuth pattern from [`src/utilities/atlasLogs.ts`](../src/utilities/atlasLogs.ts) (`ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET`, `ATLAS_GROUP_ID`).
- `HVYMETL_ATLAS_CLUSTER_ID` aligned with Atlas API cluster **name** for measurements/advisor paths.

**Deliverables**

1. **`AtlasApiMetricsConnector`** — implements `AtlasMetricsConnector.fetch()`; maps Atlas signals to [`AtlasActualPerformance`](../src/ml_engine/feedbackTypes.ts):

   | Field | Target source | Design note |
   | --- | --- | --- |
   | `slowQueryCount` | Performance Advisor / slow-operation stats (windowed) | Primary “real” signal |
   | `actualIopsUtilization` | Process measurements vs tier IOPS cap | Ratio 0–1 |
   | `actualCacheMissRate` | WiredTiger cache used/max **or** revised breach metric | Not a single Atlas API; document derivation or change `analyzeMetrics()` |

2. **Correlation metadata** — extend migration logs (optional fields): target database, collection, `projectId`, observation window, `processId`.
3. **Deferred reflection** — reflection must not run only at instant post-import; add soak delay (`HVYMETL_REFLECTION_DELAY_MS`) and/or **`hvymetl reflect --migration-id`** CLI for cron ([17-ml-engine.md §9](17-ml-engine.md)).
4. **Wiring** — `setAtlasMetricsConnector()` when Atlas creds present; `HVYMETL_ATLAS_STUB_MODE` unchanged for tests.
5. **Tests** — mocked Atlas API fixtures (mirror `atlasLogs.test.ts`); integration test optional.

**Exit criteria:** Pipeline or CLI reflection persists lessons using `source: atlas-api` metrics when breaches occur; stub remains default without creds.

**Depends on:** Existing feedback loop (Phase 0 / 3.x) — no sizing assistant dependency.

---

## Phase 4 — Atlas Vector Search for lessons retrieval

**Goal:** Rank `hvymetl_lessons_learned` with Atlas **`$vectorSearch`** instead of loading all documents and scoring in Node ([`retrieveLessonsLearned()`](../src/ml_engine/memoryEngine.ts)).

**Prerequisites**

- Phase 3 not required; needs memory DB + embeddings on write (`MONGODB_MODEL_KEY` or `OPENAI_API_KEY` in `upsertLessonLearned()`).
- Vector Search–capable Atlas tier on the **memory** cluster/database.
- Fixed embedding model and dimension across all lessons.

**Deliverables**

1. **Vector index** on `hvymetl_lessons_learned` — precomputed `embedding` field (not autoEmbed); filter field `namespace: lessons_learned`. Bootstrap via store startup or setup script (pattern: [`mongoVectorIndexService.ts`](../src/copilot/mongoVectorIndexService.ts), target `resolveMemoryDbName()`).
2. **Retrieval path** — feature flag `HVYMETL_LESSONS_VECTOR_SEARCH=1`: embed query → `$vectorSearch` → `ScoredLesson[]`; fallback chain to current cosine → embed-on-read → BM25.
3. **Scale** — stop using full `listLessons()` for design-time retrieval; keep for admin/backfill.
4. **Backfill script** — embed missing lessons; optional `embeddingModelVersion` on documents.
5. **Env/docs** — `HVYMETL_LESSONS_VECTOR_INDEX`, `HVYMETL_LESSONS_EMBEDDING_DIMENSIONS`; update [17-ml-engine.md § Lessons-learned memory](17-ml-engine.md#lessons-learned-memory-storage-vs-retrieval), `.env.example`, README.

**Exit criteria:** ML design run injects historical lessons via `$vectorSearch` when flag and index are enabled; offline/tests unchanged with flag off.

---

## Phase 5 — Release 4.0.0

**Goal:** Tag and version bump when agreed scope is complete.

**Typical checklist**

- [ ] Phase 2 sizing runtime meets exit criteria (minimum bar for “4.0” product story).
- [ ] Phase 3 and/or Phase 4 per product priority (can ship 4.0 with Phase 3 only if vector search deferred to 4.1 — document in `RELEASE.md`).
- [ ] `package.json` / `web/package.json` → **4.0.0**; GitHub release notes.
- [ ] Full `npm test`; web build green.
- [ ] Cross-links: [README.md](../README.md), [docs/README.md](README.md), [RELEASE.md](../RELEASE.md).

---

## Environment variables (4.0 cumulative)

| Variable | Phase | Purpose |
| --- | --- | --- |
| *(Grove / sizing)* | 2 | TBD with sizing API route |
| `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET`, `ATLAS_GROUP_ID` | 3 | Admin API (metrics; shared with logs) |
| `HVYMETL_ATLAS_CLUSTER_ID` | 3 | Cluster name for metrics/advisor |
| `HVYMETL_ATLAS_STUB_MODE` | 3 | `healthy` / `degraded` local stub |
| `HVYMETL_REFLECTION_DELAY_MS` | 3 | Soak before `analyzeAndReflect` |
| `HVYMETL_SCHEDULE_REFLECTION` | 3 | Design-only reflection (existing) |
| `HVYMETL_LESSONS_VECTOR_SEARCH` | 4 | Enable `$vectorSearch` path |
| `HVYMETL_LESSONS_VECTOR_INDEX` | 4 | Index name on lessons collection |
| `HVYMETL_LESSONS_EMBEDDING_DIMENSIONS` | 4 | Must match index + embed model |
| `MONGODB_URI`, `HVYMETL_MEMORY_DB` | 3–4 | Durable logs + lessons |

---

## Related documentation

| Topic | Document |
| --- | --- |
| Sizing assistant detail | [21-sizing-assistant.md](21-sizing-assistant.md) |
| Connectivity & security architect | [23-atlas-connectivity-architect.md](23-atlas-connectivity-architect.md) |
| ML engine + lessons today | [17-ml-engine.md](17-ml-engine.md) |
| Atlas Admin API (logs) | [21-atlas-logs.md](21-atlas-logs.md) |
| Migration Copilot (studio sidebar) | [20-agent-copilot.md](20-agent-copilot.md) |
