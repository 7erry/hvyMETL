/**
 * Production-readiness requirements for Agent Copilot architecture reviews.
 * Grounds LLM output in MongoDB operational pitfalls beyond pattern selection.
 */

export const ARCHITECTURE_REVIEW_PRODUCTION_SECTION = `
**Production readiness (required in every collective Architecture Review — §2–§6 and §4 validators)**

Ground every claim in **live schema context**, **migration plan $jsonSchema**, **relationship cardinality** (avg/max children, bounded flag), **Manager dataset scale**, and **Atlas inspect results**. Never assume \`paints[]\` / \`wheels[]\` arrays unless the plan shows embedded **arrays**; reverse-embedded lookups are usually singular objects (\`paint\`, \`wheel\`, \`light\`).

**§2 — Empirical cardinality & document size (mandatory table when SQL/CSV stats exist)**
- For each parent→child relationship, the system prompt **Relationships** section lists \`min\`, \`avg\`, \`p95\`, \`p99\`, \`max\`, \`[csv|database|developer|unknown]\`, and \`bounded\`. **Use those numbers directly** in the §2 table — do not write "Unavailable" for columns that have numeric values in the prompt.
- \`[csv]\` or \`[database]\` = measured from CSV exports or SQLite/.db introspection. \`[developer]\` = estimated from Embed Overrides Max (min=1, p95/p99=max). \`[unknown]\` / "no stats" = DDL-only; tell the user to add CSV/.db or set Embed Overrides Max.
- When only \`[developer]\` stats exist, label them **estimated** in Interpretation and recommend CSV/.db validation in staging.
- Rows to cover when present: models per manufacturer; cars per model; reverse-embedded lookups per car (paint/wheel/light are 0–1 object, not arrays—say so explicitly).
- **Document size projection:** estimate BSON bytes at **P50, P95, P99** fan-out using measured or developer-estimated p95/p99 from the Relationships section (not average-only). Cite 16 MB hard limit; show a worked example for the largest expected \`cars\` document (scalar fields + nested objects + any embedded arrays).

**§3 — Denormalization & refresh (Extended Reference)**
- When a host keeps a FK/reference to another collection (e.g. \`cars.modelId\` → \`models\`), list **exact fields copied** into the host vs left as id-only (e.g. \`modelName\`, \`manufacturerName\`, \`bodyStyle\` — only fields that exist in schema context).
- **Refresh strategy:** how updates propagate when the source collection changes (batch backfill job, change stream + \`$set\` on denormalized paths, or accept staleness with TTL/version). Never leave "Extended Reference" as a label without field list + refresh owner.

**§4 — Validators must be enforceable**
- Show \`$jsonSchema\` with, where applicable:
  - \`maxItems\` on every embedded **array** (use plan max children or a conservative cap, e.g. models under manufacturers).
  - \`additionalProperties: false\` on fixed-shape objects when the source SQL schema is closed.
  - Nested reverse-embedded objects **without** absorbed lookup PK fields (no \`paintId\` inside \`paint\` when \`paints\` collection was eliminated).
- Include **optimistic concurrency** when concurrent array/object updates are plausible: \`version\` or \`__v\` (int, required) + sample \`findOneAndUpdate\` filter \`{ _id, version }\` with \`$inc: { version: 1 }\`.

**§5 — Array/object mutation & concurrency**
- Document update patterns for embedded data: \`$set\` on nested object paths; \`$push\` / \`$pull\` / \`$addToSet\` / arrayFilters \`$[<id>]\` when arrays exist.
- **Race conditions:** two writers updating the same car — recommend version field or idempotent upsert keys; warn against read-modify-write without atomic operators.

**§6 — Indexes, multikey rules & pagination (critical warnings)**
- **Parallel array / multikey rule (MUST appear when ≥2 array fields could be queried together):** MongoDB **cannot** index two array fields in one compound multikey index (\`cannot index parallel arrays\`). Do **not** recommend \`{ "paints.paint_id": 1, "wheels.wheel_id": 1 }\` or similar without this warning.
  - If the domain uses **singular embedded objects** (\`paint.colorName\`, \`wheel.styleName\`), show correct dot-path filters and indexes on scalar nested paths — not plural array paths.
  - If multiple **arrays** exist, recommend: index **one** array path per compound index, use partial indexes, Atlas Search, or redesign (reference + \`$lookup\` / precomputed materialized view).
- **Pagination:** forbid \`skip/limit\` for deep pages on large collections; specify **range / cursor pagination** on indexed sort key (e.g. \`_id\`, \`vin\`, \`modelYear\`).
- **Security & compliance (short subsection):** encryption at rest (Atlas default), TLS in transit, RBAC least privilege, field-level encryption for PII if present, audit logging — tie to fields that exist (do not invent PII).
- **Data lifecycle:** archive / TTL / soft-delete policy for time-bound or superseded configuration data when relevant.
- **Shard key contingency:** even when verdict is "do not shard", name a **future compound shard key** candidate (e.g. \`{ manufacturerId: 1, _id: 1 }\`) and trigger conditions (write RPS, disk > ~2–4 TB, hotspot on single shard).

**Inspect vs plan types**
- When Atlas \`describeMongoCollectionSchema\` shows BSON type **unknown**, prefer **migration plan $jsonSchema** field types in the review and note that MCP inference lacked type detail (nested objects often infer as unknown until plan merge).
`.trim();
