# 25 — Copilot LLM Security Guardrails

Sources: [`src/copilot/copilotRequestGuard.ts`](../src/copilot/copilotRequestGuard.ts),
[`src/server/copilotRateLimit.ts`](../src/server/copilotRateLimit.ts),
[`src/server/copilotRoutes.ts`](../src/server/copilotRoutes.ts),
[`src/routes/sizingAssistantRoute.ts`](../src/routes/sizingAssistantRoute.ts)

See also [24-grove-api.md](24-grove-api.md) for Grove architecture and [20-agent-copilot.md](20-agent-copilot.md) for feature overview.

## 1. High-Level Summary

Release **4.3.0** adds **Phase 0** guardrails for Migration Studio features that call Grove (Agent Copilot chat and Atlas Sizing chat). Goals:

- Block obvious **prompt-injection channels** (client-supplied `system` messages, orphan `tool` messages).
- Cap **payload size** and **schema context** before Grove system prompts are built.
- Add **rate limits** and **structured audit logs** for abuse detection.
- Prepend a **security preamble** to Grove system prompts so user and schema content is treated as untrusted data.

Phase 1+ (server-owned chat sessions, tool confirmation gates) is documented in the Phase 0 audit roadmap inside [24-grove-api.md § Recommendations](24-grove-api.md#10-recommendations).

## 2. Threat Model (Phase 0 scope)

| Vector | Phase 0 mitigation |
| --- | --- |
| Forged `system` instructions in `/chat` body | Rejected with HTTP 400 |
| Orphan / mismatched `tool` messages | Rejected unless `tool_call_id` matches pending assistant tool calls |
| Oversized messages or schema blobs | HTTP 413 / truncation |
| High-volume Grove or inspect abuse | Per-IP rate limits (429) |
| Instructions embedded in user text or DDL metadata | System prompt preamble (defense in depth; not a full jailbreak filter) |

**Not yet mitigated in Phase 0:** fully forged multi-turn `assistant` history without server session state; workflow tools triggered by a compliant LLM without user confirmation (planned Phase 2).

## 3. Message Validation

Implemented in `sanitizeCopilotChatMessages()`.

| Endpoint | Allowed client roles | Tool chain rule |
| --- | --- | --- |
| `POST /api/copilot/chat` | `user`, `assistant`, `tool` | Each `tool` must reference a pending `tool_call` from the preceding `assistant` message |
| `POST /api/sizing-assistant/chat` | `user`, `assistant` only | No client `tool` messages (server runs tool loop) |

**Rejected:**

- Any `system` role from the client (server builds the system prompt).
- `user` or `assistant` inserted while tool responses are still pending.
- Conversation ending with unresolved tool calls.

### Limits

| Constant | Default |
| --- | --- |
| Max messages per request | 50 |
| Max characters per **user** message | 16,384 |
| Max characters per **assistant** message | 131,072 |
| Max characters per **tool** message | 32,768 (truncated if larger) |
| Max total message characters | 512,000 |

## 4. Schema Context Sanitization

`sanitizeCopilotSchemaContext()` bounds client-supplied `schemaContext` before `buildCopilotSystemPrompt()`:

| Field | Cap |
| --- | --- |
| Tables | 500 (names truncated to 512 chars) |
| Relationships | 2,000 |
| Guardrail issues | 200 |
| Collections | 500 |
| Override maps | 500 keys each |
| String metadata fields | 512 chars |

The studio still sends schema context from the loaded model; Phase 1 will derive this server-side from workspace state.

## 5. System Prompt Preamble

`COPILOT_PROMPT_INJECTION_GUARD` is prepended to:

- Agent Copilot — `buildCopilotSystemPrompt()`
- Atlas Sizing — `buildSizingAssistantSystemPrompt()`

It instructs the model to treat user messages and schema blocks as **untrusted data** and not follow embedded instructions that conflict with tool policy or tenant scope.

## 6. Rate Limiting

In-memory sliding window per client IP (`src/server/copilotRateLimit.ts`).

| Kind | Route(s) | Default max / window |
| --- | --- | --- |
| `chat` | `POST /api/copilot/chat` | 30 / 60s |
| `inspect` | `POST /api/copilot/mongo/inspect`, vector/search index routes | 120 / 60s |
| `sizing-chat` | `POST /api/sizing-assistant/chat` | 30 / 60s |

Environment overrides (see [`.env.example`](../.env.example)):

```bash
HVYMETL_COPILOT_CHAT_RATE_LIMIT=30
HVYMETL_COPILOT_INSPECT_RATE_LIMIT=120
HVYMETL_SIZING_CHAT_RATE_LIMIT=30
HVYMETL_COPILOT_RATE_LIMIT_WINDOW_MS=60000
HVYMETL_COPILOT_RATE_LIMIT_DISABLED=1   # tests / local dev only
```

Exceeded limits return **HTTP 429** with a `Retry-After` header (seconds).

## 7. Audit Logging

`auditCopilotEvent()` writes single-line JSON to server logs (`component: copilot-guard`). **Message bodies are never logged.**

| Event kind | When |
| --- | --- |
| `copilot.chat` | Successful chat validation |
| `copilot.inspect` | Mongo inspect tool invocation |
| `copilot.index` | Vector or Atlas Search index creation |
| `sizing.chat` | Sizing assistant chat validation |
| `copilot.validation_failed` | Guard rejection (includes `reason`) |

Fields: `ts`, `tenantId`, `userSub`, `tool`, `messageCount`, `ok`, `reason`.

## 8. Code Map

| Module | Role |
| --- | --- |
| `src/copilot/copilotRequestGuard.ts` | Message/schema sanitization, audit helper |
| `src/copilot/copilotPromptInjectionGuard.ts` | Shared system-prompt security preamble |
| `src/server/copilotRateLimit.ts` | Express rate-limit middleware |
| `src/server/copilotRoutes.ts` | Copilot API wiring |
| `src/routes/sizingAssistantRoute.ts` | Sizing chat wiring |

## 9. Verification

```bash
npm test -- src/copilot/copilotRequestGuard.test.ts
npm test -- src/server/copilotRateLimit.test.ts
npm test -- src/server/copilotRoutes.test.ts
```

Manual checks:

1. POST `/api/copilot/chat` with `{ "role": "system", ... }` → 400.
2. POST `/api/copilot/chat` with orphan `tool` message → 400.
3. Exceed chat rate limit from one IP → 429 with `Retry-After`.

## 10. Roadmap (post Phase 0)

| Phase | Focus |
| --- | --- |
| **1** | Server-owned chat sessions; stop trusting client `assistant` history |
| **2** | Tool policy engine; confirmation gates for workflow and index mutations |
| **3** | Indirect injection hardening; aggregation stage allowlist review |
| **4** | Grove timeouts, unified HTTP client, cost caps, anomaly alerts |

Details: [24-grove-api.md § Recommendations](24-grove-api.md#10-recommendations).
