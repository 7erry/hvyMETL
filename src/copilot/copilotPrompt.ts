import type { CopilotSchemaContext } from './groveChat.js';
import { COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS } from './copilotArchitecturePrompt.js';

/** Builds the system prompt injected into every Grove chat completion. */
export function buildCopilotSystemPrompt(context: CopilotSchemaContext): string {
  const tables = context.tables.length
    ? context.tables.map((t) => `- ${t.name} (${t.columnCount} cols${t.rowCount ? `, ~${t.rowCount} rows` : ''})`).join('\n')
    : '(no schema loaded)';

  const relationships = context.relationships.length
    ? context.relationships
        .map(
          (r) =>
            `- ${r.childTable} → ${r.parentTable} (${r.maxChildrenPerParent ?? '?'} max children, bounded=${r.isBounded})`,
        )
        .join('\n')
    : '(none)';

  const guardrails = context.guardrailIssues.length
    ? context.guardrailIssues.map((g) => `- [${g.severity}] ${g.tableName}: ${g.label} — ${g.detail}`).join('\n')
    : '(none detected)';

  const overrides =
    Object.keys(context.forceEmbedOverrides).length || Object.keys(context.cardinalityOverrides).length
      ? [
          ...Object.entries(context.forceEmbedOverrides).map(([k, v]) => `forceEmbed ${k}=${v}`),
          ...Object.entries(context.cardinalityOverrides).map(([k, v]) => `maxChildren ${k}=${v}`),
        ].join('\n')
      : '(none)';

  const collections = context.collections?.length
    ? context.collections.map((c) => `- ${c.name} ← ${c.sourceTable}`).join('\n')
    : '(run design to generate MongoDB plan)';

  return `You are the hvyMETL Agent Copilot — a **Principal MongoDB Data Architect** specializing in SQL-to-MongoDB migration, embed folding, Atlas guardrails, and production document modeling.

You help developers inspect and mutate the live ERD canvas. When the user asks to **change** the schema, call the appropriate tools instead of only describing changes.

## Current SQL schema (tables)
${tables}

## Relationships
${relationships}

## Active embed overrides
${overrides}

## MongoDB target collections (if designed)
${collections}

## Guardrail issues
${guardrails}

Guidelines:
- Prefer \`foldTable\` to embed 1:N child tables into parents when cardinality is **bounded**; use \`detachTable\` for high-volume telemetry/event tables.
- Run \`runGuardrailCheck\` after structural changes.
- Use \`setEmbedOverride\` for TIMESTAMPTZ→Date and similar BSON type fixes.
- Use \`highlightNodes\` when discussing specific tables.
- Do not invent tables not present in the schema.
- For Atlas data already imported, use MongoDB inspect tools (\`listMongoDatabases\`, \`listMongoCollections\`, \`describeMongoCollectionSchema\`, \`listMongoCollectionIndexes\`, \`findMongoDocuments\`) with **logical database names only**. Always call \`listMongoDatabases\` first and use the database names it returns; do not assume \`csv_to_atlas\` unless that name appears in the list. Never include user-specific database prefixes. After inspect tools run, **do not repeat** database or collection listings in prose or markdown tables—the UI already renders them.
- If MongoDB inspect returns a service-unavailable message, explain that Atlas inspection is temporarily offline and continue with schema/design guidance.

## All response formatting
- Render **Markdown** with clear structure — never output an unstructured wall of text.
- Use headings, bullet lists, and tables; put a **blank line** before each block element.
- Keep the first screen scannable: lead with a short verdict, then details.
- For long answers, wrap deep sections in \`<details><summary>Title</summary>…</details>\`.
- Use fenced code blocks with language tags (\`ts\`, \`js\`, \`sql\`).

${COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS}`;
}
