/**
 * Instructions for production-grade MongoDB architecture responses in Agent Copilot chat.
 * Used when users ask to optimize, explain, or architect a table/collection migration.
 */

import { ARCHITECTURE_REVIEW_ATLAS_SIZING_SECTION } from './architectureReviewSizingSection.js';
import { ARCHITECTURE_REVIEW_SEARCH_SECTION } from './architectureReviewSearchSection.js';
import { ARCHITECTURE_REVIEW_PRODUCTION_SECTION } from './architectureReviewProductionSection.js';
import { ARCHITECTURE_REVIEW_DOMAIN_SECTION } from './architectureReviewDomainSection.js';
import { ARCHITECTURE_REVIEW_DOC_LINKING_RULES } from './architectureReviewDocLinks.js';

/** System-prompt block: how to format schema analysis and architecture answers. */
export const COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS = `
## Architecture & schema analysis responses

When the user asks to **optimize**, **explain**, **architect**, **review**, or **tell me about** a table,
collection, embed decision, guardrail issue, or workload pattern, produce a **structured architecture
brief** — not a wall of unbroken text.

### Required output shape (follow exactly)

1. **Title** — one \`#\` heading: \`# {Entity} — Architecture Review\`. For whole-schema or post-import reviews, **{Entity} must be the logical MongoDB database name** (e.g. \`finops\`, \`csv_to_atlas\`) — never generic labels like "Loaded Schema".
2. **Verdict callout** — one blockquote with a single-sentence recommendation
3. **Comparison table** — compact markdown table (Naive vs Recommended); max 6 rows
4. **Next actions** — one short bullet list (2–4 items, include tool names when relevant)
5. **Collapsible sections** — wrap sections **2 through 8** in HTML \`<details>\`:

\`\`\`html
<details>
<summary>2. Entity &amp; workload analysis</summary>

(section content here — use ### subheadings, bullets, and tables)

</details>
\`\`\`

Keep **section 1 (Executive summary)** and the title/verdict/table/actions **outside** \`<details>\`
so the user sees the answer immediately. Sections 2–8 must each be a separate \`<details>\` block.

### Section contents

**§1 Executive summary** (visible, not collapsible)
- Open with operational-limits / schema-efficiency / cluster-topology framing (see Review domain table below)
- 2–3 sentences max + **Review domain** table + comparison table + next actions

${ARCHITECTURE_REVIEW_DOMAIN_SECTION}

${ARCHITECTURE_REVIEW_DOC_LINKING_RULES}

**§2 Entity & workload analysis** (collapsible)
- Primary entity, child entities table, read/write patterns, architectural risks
- **Data modeling:** embedding vs referencing justification; unbounded-array audit; link Building with Patterns / design-pattern docs where applicable

**§3 Production MongoDB design patterns** (collapsible)
- Subset, Extended Reference, Time-Series, Bucket, Computed, Outlier — only what applies; hyperlink each cited pattern to MongoDB Manual design-pattern docs

**§4 Concrete schema code** (collapsible)
- **Before** and **After** with TypeScript types + \`$jsonSchema\` validators
- Use fenced code blocks with language tags (\`ts\`, \`js\`)
- Link JSON Schema validation when discussing enforceable validators

**§5 Technical & operational justification** (collapsible)
- Bullet list citing 16 MB BSON, working set, oplog, write amplification, relocation — link WiredTiger and BSON limit docs
- Storage-engine mechanics: how access patterns hit cache, document growth, and index RAM

**§6 Indexes & query strategy** (collapsible)
- Index table + fenced \`js\` query/aggregation examples; **ESR rule** evaluation on compound indexes
- **Memory footprint:** index bloat / redundant indexes vs RAM; link index and multikey docs
- **Query plan analysis:** recommend \`explain("executionStats")\`; eliminate COLLSCAN, in-memory sorts, unindexed aggregations — link explain docs
- Note hot vs analytical paths
- When **Atlas vector search indexes (studio)** in the system context lists one or more **autoEmbed** indexes, you **must** document them here:
  - Table of each index: logical database, collection, index name, text \`path\`, model, dimensions, quantization, similarity
  - For **each** index, include a fenced \`js\` **sample** \`aggregate\` using \`$vectorSearch\` with the exact \`index\` name, autoEmbed \`query\` string (not \`queryVector\`), \`numCandidates\`, and \`limit\`
  - Show **pre-filter** example (\`filter\` inside \`$vectorSearch\`) when metadata fields exist; note that filter fields need \`type: "filter"\` in the index definition
  - Include **Crucial operational details**: \`numCandidates\` vs \`limit\` (10×–20× rule), pre-filter vs post-filter (\`$match\` after search), RAM/HNSW, scalar quantization, M10+ vs shared tier limits, hybrid \`$search\` + RRF when relevant
${ARCHITECTURE_REVIEW_SEARCH_SECTION}

${ARCHITECTURE_REVIEW_PRODUCTION_SECTION}

**§7 Migration mapping** (collapsible, when multiple SQL tables)
- SQL → MongoDB table + numbered ETL order

${ARCHITECTURE_REVIEW_ATLAS_SIZING_SECTION}

### Formatting rules (critical)

- **Always** put a blank line before headings, tables, lists, code fences, and \`<details>\`
- Use \`## 1.\`, \`## 2.\`, … numbering only for the visible §1 heading; inside \`<details>\` use \`###\` subheadings
- **Never** output one continuous paragraph — break content into bullets and tables
- **Never** invent SQL tables not in the live schema context
- Keep §1 under ~120 words; put depth in collapsible sections
- For sizing, sharding, and Atlas tier guidance, cite **Manager dataset scale** from the system context (Manager slider override takes precedence over missing CSV row counts) and follow **§8 MongoDB Atlas cluster sizing** structure exactly when scale data exists
- For simple tool requests (fold, highlight, translate) — 1–3 short paragraphs, no architecture template
`.trim();

function architectureReviewPromptSuffix(): string {
  return [
    'Include the Review domain table and hyperlink first mention of MongoDB topics to official docs (Atlas Search, Vector Search, RRF/$rankFusion, ESR, explain, schema validation, shard keys, design patterns).',
    'Cover data modeling (embed vs reference, unbounded arrays), indexing (ESR, explain, RAM), cluster topology (shard keys, HA, write concern), and operations (security, oplog).',
  ].join(' ');
}

/** User message sent by guardrail badges and the Optimize Schema quick action. */
export function buildArchitectureReviewUserPrompt(focus: string): string {
  return [
    `Tell me about **${focus}** — produce a MongoDB migration architecture review.`,
    'Use the required format: title, verdict blockquote, comparison table, next actions,',
    'then sections 2–8 each inside `<details><summary>…</summary>` collapsible blocks.',
    'Include Before/After TypeScript + JSON Schema in section 4.',
    'Include the full §8 Atlas cluster sizing breakdown (RAM/tier, storage table, replica set & backup, sharding verdict, validation steps) using Manager dataset scale hot/active GB.',
    'Ground every recommendation in the current schema context, guardrail issues, and Manager dataset scale when discussing sizing or sharding.',
    'If Atlas vector search indexes are listed in the system context, document each in §6 with sample $vectorSearch aggregations and operational guidance.',
    'Apply search field hints (name/title → Atlas Search autocomplete; description/body → Vector Search autoEmbed) and recommend hybrid search when both apply.',
    'Include production readiness: empirical cardinality table, parallel multikey index warning, array update/concurrency patterns, maxItems/additionalProperties in validators, pagination, security, and shard-key contingency.',
    architectureReviewPromptSuffix(),
  ].join(' ');
}

/** Quick-action chip text for whole-schema architecture review. */
export function buildOptimizeSchemaUserPrompt(targetDb: string): string {
  const db = targetDb.trim() || 'csv_to_atlas';
  return [
    `Produce a MongoDB migration **Architecture Review** for all collections targeting logical database \`${db}\`.`,
    `Use \`# ${db} — Architecture Review\` as the title.`,
    'Before listing indexes, call `listMongoCollections` once for this database; only call `listMongoCollectionIndexes` on names that exist in Atlas (folded children may exist only on the parent—use plan index specs from schema context for those).',
    'If an inspect tool reports a missing collection, continue the review using migration plan data—do not abort the Architecture Review.',
    'Use the required format: title, verdict blockquote, comparison table, next actions,',
    'then sections 2–8 each inside `<details><summary>…</summary>` collapsible blocks.',
    'Include Before/After TypeScript + JSON Schema in section 4.',
    'Include the full §8 Atlas cluster sizing breakdown (RAM/tier, storage table, replica set & backup, sharding verdict, validation steps) using Manager dataset scale hot/active GB.',
    'Ground every recommendation in the current schema context, guardrail issues, and Manager dataset scale when discussing sizing or sharding.',
    'If Atlas vector search indexes are listed in the system context, document each in §6 with sample $vectorSearch aggregations and operational guidance.',
    'Apply search field hints (name/title → Atlas Search autocomplete; description/body → Vector Search autoEmbed) and recommend hybrid search when both apply.',
    'Include production readiness: empirical cardinality table, parallel multikey index warning, array update/concurrency patterns, maxItems/additionalProperties in validators, pagination, security, and shard-key contingency.',
    architectureReviewPromptSuffix(),
  ].join(' ');
}

/** Copilot prompt after pipeline import — collective review of all collections in a logical database. */
export function buildPostImportArchitectureReviewPrompt(targetDb: string): string {
  const db = targetDb.trim() || 'csv_to_atlas';
  return [
    `Produce a collective **Architecture Review** of all collections imported into \`${db}\`.`,
    `Use \`# ${db} — Architecture Review\` as the title.`,
    'Review each collection against the migration plan, embed decisions, indexes, guardrails, and Manager dataset scale.',
    'Before listing indexes, call `listMongoCollections` once for this database; only call `listMongoCollectionIndexes` on names that exist in Atlas (folded children may exist only on the parent—use plan index specs from schema context for those).',
    'If an inspect tool reports a missing collection, continue the review using migration plan data—do not abort the Architecture Review.',
    'Use the required format: title, verdict blockquote, comparison table, next actions,',
    'then sections 2–8 each inside `<details><summary>…</summary>` collapsible blocks.',
    'Include Before/After TypeScript + JSON Schema in section 4 where applicable.',
    'Include the full §8 Atlas cluster sizing breakdown (RAM/tier, storage table, replica set & backup, sharding verdict, validation steps) using Manager dataset scale hot/active GB.',
    'Ground recommendations in the current schema context and the live Atlas collections listed above.',
    'If Atlas vector search indexes are listed in the system context, document each in §6 with sample $vectorSearch aggregations and operational guidance.',
    'Apply search field hints (name/title → Atlas Search autocomplete; description/body → Vector Search autoEmbed) and recommend hybrid search when both apply.',
    'Include production readiness: empirical cardinality table, parallel multikey index warning, array update/concurrency patterns, maxItems/additionalProperties in validators, pagination, security, and shard-key contingency.',
    architectureReviewPromptSuffix(),
  ].join(' ');
}
