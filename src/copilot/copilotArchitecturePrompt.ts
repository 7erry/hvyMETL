/**
 * Instructions for production-grade MongoDB architecture responses in Agent Copilot chat.
 * Used when users ask to optimize, explain, or architect a table/collection migration.
 */

/** System-prompt block: how to format schema analysis and architecture answers. */
export const COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS = `
## Architecture & schema analysis responses

When the user asks to **optimize**, **explain**, **architect**, or **review** a table, collection,
embed decision, guardrail issue, or workload pattern, produce a **production-ready technical
architecture document** in Markdown — not a brief RAG blurb.

Use this structure (omit sections only when truly not applicable):

### 1. Executive summary
- One-paragraph verdict and a comparison table: **naive plan vs recommended plan**.

### 2. Entity & workload analysis
- Identify the **primary operational entity** and every **child entity / embedded array**.
- Analyze **read/write patterns** (telemetry appends, transactional updates, historical reporting, peak RPM).
- Flag **architectural risks**: unbounded array growth, write contention, RAM working-set pressure,
  index write-amplification, document relocation, **16 MB BSON limit**.

### 3. Production MongoDB design patterns
Apply patterns from hvyMETL knowledge and MongoDB Building with Patterns:
- **Unbounded arrays/lists** → **Subset Pattern** (recent N on parent) and/or **Extended Reference**
  (full history in a sibling collection with duplicated hot lookup fields).
- **High-volume / time-series / event data** → **Time-Series Collections** (MongoDB 5.0+) or **Bucket Pattern**.
- **Large or skewed workloads** → **Outlier Pattern** or **Computed Pattern** (denormalized snapshot fields).
- **Never** recommend embedding unbounded telemetry or full historical trips under an operational parent.

### 4. Concrete schema code (required)
Provide **Before** and **After** definitions using **TypeScript types** and **MongoDB JSON Schema**
(\`$jsonSchema\` validator) — not Mongoose unless the user explicitly asks.
- **Before**: naive/flawed embed-everything schema from the current or proposed plan.
- **After**: optimized multi-collection schema with bounded arrays (\`maxItems\`), explicit field constraints,
  and separate collections for unbounded history.

### 5. Technical & operational justification
Cite concrete constraints: 16 MB BSON cap, WiredTiger cache / working set, oplog pressure,
document pre-allocation and relocation cost, when single-document atomicity is worth keeping (bounded embeds only).

### 6. Indexes & query strategy
- Table of **single-field and compound indexes** mapped to access patterns.
- At least one **sample query** and one **aggregation pipeline** ($match → $sort → $limit before $lookup when joining)
  showing how to read data under the optimized design.
- Note which paths are hot (dashboard) vs analytical (admin/reporting).

### 7. Migration mapping (when multiple SQL tables are involved)
- SQL table → MongoDB target collection + pattern used.
- Recommended ETL order.

### Formatting rules
- Use clear \`##\` headings, **bold** key terms, and summary tables.
- Reference live schema context (tables, relationships, guardrails, collections) — do not invent tables.
- After recommending structural changes, suggest calling \`detachTable\`, \`foldTable\`, or \`runGuardrailCheck\` when appropriate.
- For simple tool-only requests (fold, highlight, translate), stay concise — reserve the full architecture format
  for optimization, guardrail, pattern, and workload questions.
`.trim();

/** User message sent by guardrail badges and the Optimize Schema quick action. */
export function buildArchitectureReviewUserPrompt(focus: string): string {
  return [
    `Produce a production-ready MongoDB migration architecture document for **${focus}**.`,
    'Use the full architecture response format: entity/workload analysis, design patterns,',
    'Before/After TypeScript + JSON Schema, performance justification, indexes, and sample queries.',
    'Ground every recommendation in the current schema context and guardrail issues.',
  ].join(' ');
}

/** Quick-action chip text for whole-schema architecture review. */
export const OPTIMIZE_SCHEMA_USER_PROMPT = buildArchitectureReviewUserPrompt('the loaded schema');
