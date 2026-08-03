# Atlas cluster sizing assistant (Release 4.0)

The **sizing assistant** is a dedicated agent flow for MongoDB Atlas cluster sizing: it collects workload parameters, optionally extracts them from curated meeting transcripts, runs the sizing engine, and presents tier recommendations without exposing raw pricing breakdowns in chat.

**Release 4.0 scope** also includes production **lessons learned** (live Atlas metrics + vector retrieval). Phase breakdown: [22-release-4.0-roadmap.md](22-release-4.0-roadmap.md) (**Phase 1** = this document; **Phases 2–5** = runtime, metrics, vector search, version tag).

## System prompt

The LLM system prompt lives in the server package:

| Module | Purpose |
| --- | --- |
| [`src/copilot/sizingAssistantPrompt.ts`](../src/copilot/sizingAssistantPrompt.ts) | Role, tool-use rules, unsupported-config handling, output format |
| [`src/copilot/sizingAssistantLogicReference.ts`](../src/copilot/sizingAssistantLogicReference.ts) | **Logic Abstract** — normalization, tier filters, shard/secondary math, cost penalty, ranking |
| [`src/copilot/sizingAssistantInfrastructureFramework.ts`](../src/copilot/sizingAssistantInfrastructureFramework.ts) | **Infrastructure Architect** — WSS/RAM, vCPU, storage/IOPS/backup, oplog, HA/sovereignty, five-part output template, application input checklist |

Use `buildSizingAssistantSystemPrompt()` (or `SIZING_ASSISTANT_SYSTEM_PROMPT`) when wiring the sizing chat endpoint or Grove preset for 4.0.

## Expected tools (runtime)

The prompt instructs the model to call:

| Tool | When |
| --- | --- |
| `update_sizing_parameters` | User provides or updates sizing inputs (reads, writes, data size, flags, etc.) |
| `update_shard_penalty` | User changes sharding cost sensitivity |
| `abort_sizing_process` | User cancels the flow |
| `handoff_to_resource_curator` | User changes Salesforce / transcript resources |
| `get_session_transcripts` | After resource selection, before transcript extraction |
| `extract_sizing_from_transcripts` | User confirms extraction from selected transcripts |
| `find_optimal_cluster_tier` | System runs sizing (model presents results) |
| `prompt_for_missing_info` | System asks for missing required parameters |

Tool schemas and API routes are added as the 4.0 studio UI and backend state machine land.

## Behavioral notes

- **Cluster-level only:** per-collection numbers must be aggregated with an explicit note to the user.
- **Unsupported topology/features:** acknowledge deployment defaults (3-node replica set, `us-east-1`, AWS) but still set HA/geo flags and run calculation where applicable.
- **After calculation:** include parameters used in the recommendation; do **not** repeat hourly cost breakdown or total price in the assistant message.

## Verification

```bash
npm test -- src/copilot/sizingAssistantPrompt.test.ts
```

See also [Agent Copilot](./20-agent-copilot.md) for the migration-studio copilot (separate from sizing assistant).

## Release 4.0 phases

| Phase | This doc |
| --- | --- |
| **1** — Prompts (current) | Above |
| **2** — Sizing runtime | [22-release-4.0-roadmap.md § Phase 2](22-release-4.0-roadmap.md#phase-2--sizing-assistant-runtime) |
| **3–4** — Lessons learned (Atlas metrics + vector search) | [22-release-4.0-roadmap.md § Phases 3–4](22-release-4.0-roadmap.md#phase-3--live-atlas-metrics-lessons-learned-feedback-loop) |
| **5** — 4.0.0 release | [22-release-4.0-roadmap.md § Phase 5](22-release-4.0-roadmap.md#phase-5--release-400) |
