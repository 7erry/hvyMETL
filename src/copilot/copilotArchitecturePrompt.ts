/**
 * Instructions for production-grade MongoDB architecture responses in Agent Copilot chat.
 * Used when users ask to optimize, explain, or architect a table/collection migration.
 */

/** System-prompt block: how to format schema analysis and architecture answers. */
export const COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS = `
## Architecture & schema analysis responses

When the user asks to **optimize**, **explain**, **architect**, **review**, or **tell me about** a table,
collection, embed decision, guardrail issue, or workload pattern, produce a **structured architecture
brief** — not a wall of unbroken text.

### Required output shape (follow exactly)

1. **Title** — one \`#\` heading: \`# {Entity} — Architecture Review\`
2. **Verdict callout** — one blockquote with a single-sentence recommendation
3. **Comparison table** — compact markdown table (Naive vs Recommended); max 6 rows
4. **Next actions** — one short bullet list (2–4 items, include tool names when relevant)
5. **Collapsible sections** — wrap sections **2 through 7** in HTML \`<details>\`:

\`\`\`html
<details>
<summary>2. Entity &amp; workload analysis</summary>

(section content here — use ### subheadings, bullets, and tables)

</details>
\`\`\`

Keep **section 1 (Executive summary)** and the title/verdict/table/actions **outside** \`<details>\`
so the user sees the answer immediately. Sections 2–7 must each be a separate \`<details>\` block.

### Section contents

**§1 Executive summary** (visible, not collapsible)
- 2–3 sentences max + comparison table + next actions

**§2 Entity & workload analysis** (collapsible)
- Primary entity, child entities table, read/write patterns, architectural risks

**§3 Production MongoDB design patterns** (collapsible)
- Subset, Extended Reference, Time-Series, Bucket, Computed, Outlier — only what applies

**§4 Concrete schema code** (collapsible)
- **Before** and **After** with TypeScript types + \`$jsonSchema\` validators
- Use fenced code blocks with language tags (\`ts\`, \`js\`)

**§5 Technical & operational justification** (collapsible)
- Bullet list citing 16 MB BSON, working set, oplog, write amplification, relocation

**§6 Indexes & query strategy** (collapsible)
- Index table + fenced \`js\` query/aggregation examples
- Note hot vs analytical paths

**§7 Migration mapping** (collapsible, when multiple SQL tables)
- SQL → MongoDB table + numbered ETL order

### Formatting rules (critical)

- **Always** put a blank line before headings, tables, lists, code fences, and \`<details>\`
- Use \`## 1.\`, \`## 2.\`, … numbering only for the visible §1 heading; inside \`<details>\` use \`###\` subheadings
- **Never** output one continuous paragraph — break content into bullets and tables
- **Never** invent SQL tables not in the live schema context
- Keep §1 under ~120 words; put depth in collapsible sections
- For simple tool requests (fold, highlight, translate) — 1–3 short paragraphs, no architecture template
`.trim();

/** User message sent by guardrail badges and the Optimize Schema quick action. */
export function buildArchitectureReviewUserPrompt(focus: string): string {
  return [
    `Tell me about **${focus}** — produce a MongoDB migration architecture review.`,
    'Use the required format: title, verdict blockquote, comparison table, next actions,',
    'then sections 2–7 each inside `<details><summary>…</summary>` collapsible blocks.',
    'Include Before/After TypeScript + JSON Schema in section 4.',
    'Ground every recommendation in the current schema context and guardrail issues.',
  ].join(' ');
}

/** Quick-action chip text for whole-schema architecture review. */
export const OPTIMIZE_SCHEMA_USER_PROMPT = buildArchitectureReviewUserPrompt('the loaded schema');
