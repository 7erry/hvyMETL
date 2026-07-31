import {
  buildMigrationWorkflowGuideLink,
  buildImportExampleActionLink,
  buildPromptActionLink,
  buildWorkflowActionLink,
} from './copilotActionLinks';

/** Detects general copilot capability / help questions. */
export function isCopilotHelpQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return /^(?:how\s+(?:can|do)\s+you\s+help(?:\s+me)?|what\s+can\s+you\s+(?:help(?:\s+me)?\s+with|do)|what\s+do\s+you\s+do)\??$/i.test(
    trimmed,
  );
}

/** User prompt and chip label for the full command reference. */
export const COPILOT_COMMANDS_USER_PROMPT = 'what are all the commands you know?';

/** Detects requests for the full slash / natural-language command list. */
export function isCopilotCommandsQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return /^(?:what\s+are\s+(?:all\s+)?(?:the\s+)?commands(?:\s+you\s+know)?|list\s+(?:all\s+)?commands)\??$/i.test(
    trimmed,
  );
}

/** Static help reply when the user asks what the copilot can do. */
export function buildCopilotHelpResponse(): string {
  return [
    'I can help you migrate SQL to MongoDB end-to-end:',
    '',
    `1. ${buildWorkflowActionLink('Clear session', 'clearSession')} — wipe canvas and open schema import`,
    `2. ${buildImportExampleActionLink('Import ledger example', 'ledger')} — or paste SQL DDL in the import dialog`,
    `3. ${buildWorkflowActionLink('Refresh design', 'refreshDesign')} — generate the MongoDB target schema (ML/RAG)`,
    `4. ${buildWorkflowActionLink('Run pipeline', 'runPipeline')} — load CSV/SQLite data into Atlas`,
    '5. **Inspect Atlas** — list databases and collections, describe schema, find/aggregate/explain, compare to plan',
    '6. **Vector search (Phase 3)** — create Atlas **autoEmbed** indexes on text fields (dialog or chat)',
    '7. **MongoDB Search (lexical)** — keyword, autocomplete, and faceted `$search` indexes via copilot tool',
    '',
    'I also fold embeds on the ERD, run guardrails, translate SQL queries, and explain MongoDB operations.',
    '',
    'After each workflow step, click **Next step** on the tool card or the linked step in the message.',
    '',
    `**Try:** ${buildMigrationWorkflowGuideLink()}`,
    '',
    'Or use quick actions below, slash commands like `/refresh-design`, or ask naturally (e.g. *show me databases*, *create vector search on products*).',
  ].join('\n');
}

/** Static command reference when the user asks for all known commands. */
export function buildCopilotCommandsResponse(): string {
  return [
    'Here are the commands and prompts I recognize (direct routing or quick actions):',
    '',
    '### Migration workflow',
    `- \`/clear-session\` or ${buildWorkflowActionLink('clear session', 'clearSession')} — wipe session and open schema import`,
    `- \`/refresh-design\` or ${buildWorkflowActionLink('refresh design', 'refreshDesign')} — regenerate MongoDB target schema (ML/RAG)`,
    `- \`/run-pipeline\` or ${buildWorkflowActionLink('run pipeline', 'runPipeline')} — open the Atlas import panel`,
    `- ${buildMigrationWorkflowGuideLink()} — step-by-step with clickable **Next step** links`,
    '- **import `{example}` example** — built-in DDL (direct: `oracle`, `analytics`, `cms`, `iot`, `ledger`, `mobile`, `catalog`, `personalization`, `singleview`; more via **Load example** in schema import)',
    '',
    '### Canvas & schema tools',
    '- `/fold child -> parent [array|single]` — embed a child table into a parent collection',
    '- `/fold-all` or **fold all tables** — force-embed every FK relationship (same as Embed Overrides → Force All)',
    '- `/guardrails` or **Check Guardrails** — migration risk analysis on the ERD',
    '- `/translate` or **Translate SQL** — open Query Translator tab',
    '- `/highlight table1 table2` — focus tables on the canvas',
    '- `/clear-overrides` — reset embed overrides',
    '- **Optimize Schema** — architecture review for the target database (collapsible sections; **Save to Google Docs** on the review)',
    '',
    '### MongoDB inspect (Atlas)',
    'Requires MongoDB inspect on the server. Use **logical database names** only (e.g. `csv_to_atlas`). Omit `database` when the collection name is unique.',
    '',
    '- **list databases** / **show me databases** / **what are the databases?**',
    '- **list collections from `{db}`** / **list collections in `{db}`** / **what collections are in `{db}`?**',
    '- **describe `{db}.{collection}`** / **describe `{collection}` in `{db}`** / **show schema for `{db}.{collection}`**',
    '- **find in `{db}.{collection}` where …** — e.g. *find in finops.accounts where current balance > 9000* (also *find in `{collection}` where …* when unique)',
    '- **count in `{db}.{collection}` where …** — match counts via aggregation',
    '- **list indexes** on `{collection}` / `{db}.{collection}` — via LLM **listMongoCollectionIndexes** (inspect cards also show indexes)',
    '- **aggregate** on `{collection}` — grouped metrics via **aggregateMongoCollection** (read-only pipeline)',
    '- **explain** find/aggregate on `{collection}` — **explainMongoOperation**',
    '- **compare `{collection}` to plan** — **compareMongoCollectionToPlan** after Refresh design',
    '',
    'After inspect/analyze tools run, the UI shows structured tables — use **Next step** on the tool card when offered.',
    '',
    '### Vector search — Phase 3 (autoEmbed)',
    'Creates Atlas Vector Search indexes with **Automated Embeddings** on a **string** text field (Voyage AI). Index creation uses the MongoDB driver; inspect tools stay read-only.',
    '',
    '- **create vector search on `{collection}`** — opens the studio dialog (pick database → collection → field)',
    '- **create vector search on `{collection}.{field}`** — e.g. *create vector search on products.description*',
    '- **create vector search index on `{db}.{collection}`** — e.g. *create vector search index on Vectors.products*',
    '- **Create autoEmbed vector index…** — button on schema/index inspect tool cards',
    '- Copilot tool **createMongoAutoEmbedVectorIndex** (chat) — call **describeMongoCollectionSchema** first when the field is unknown',
    '',
    'Recorded indexes appear in **Optimize Schema** / design-report exports with sample `$vectorSearch` aggregations and operational notes.',
    '',
    '### MongoDB Search — lexical (`$search`)',
    'Full-text and faceted search via [Atlas Search index definitions](https://www.mongodb.com/docs/search/index/index-definitions/) — not vector similarity.',
    '',
    '- Copilot tool **createMongoAtlasSearchIndex** with **pattern**:',
    '  - **keyword** — `textPaths` (`string` fields); sample `$search.text` across title/description',
    '  - **autocomplete** — `path` with `autocomplete` + `edgeGram`; sample `$search.autocomplete` with optional fuzzy',
    '  - **faceted** — `textPath`, `stringFacetPaths`, optional `numberFacets` with `boundaries`; sample `$searchMeta` facet buckets',
    '- **POST /api/copilot/mongo/atlas-search-index** — same body as the tool',
    '- Validate queries with **aggregateMongoCollection** (`$search` / `$searchMeta` stages are read-only)',
    '',
    'Recorded lexical indexes appear in architecture context with JSON definitions and sample aggregations.',
    '',
    '### Manager dataset scale',
    '- **what is the current raw data size?** / **dataset scale — raw data** — Manager slider override or schema estimate',
    '- Manager **Dataset scale — raw data** (up to 21 TB) feeds Atlas sizing and sharding guidance in architecture reviews when CSV row counts are unavailable',
    '',
    '### Quick-action chips (footer)',
    '- **Migration steps**, **Check Guardrails**, **Optimize Schema**, **Translate SQL**',
  ].join('\n');
}
