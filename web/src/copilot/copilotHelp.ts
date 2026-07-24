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
    '1. **Clear session & import SQL** — paste DDL or load a built-in example',
    '2. **Refresh design** — generate the MongoDB target schema (ML/RAG)',
    '3. **Run pipeline** — load CSV/SQLite data into Atlas',
    '4. **Inspect Atlas** — list databases and collections, compare to plan',
    '',
    'I also fold embeds on the ERD, run guardrails, translate SQL queries, and explain MongoDB operations.',
    '',
    'After each workflow step, use the **Next step** button on the tool result card — no need to type commands.',
    '',
    '**Try:** Guide me through the migration workflow',
    '',
    'Or use quick actions below, slash commands like `/refresh-design`, or ask naturally (e.g. *show me databases*).',
  ].join('\n');
}

/** Static command reference when the user asks for all known commands. */
export function buildCopilotCommandsResponse(): string {
  return [
    'Here are the commands and prompts I recognize:',
    '',
    '### Migration workflow',
    '- `/clear-session` or **clear session** — wipe session and open schema import',
    '- `/refresh-design` or **refresh design** — regenerate MongoDB target schema',
    '- `/run-pipeline` or **run pipeline** — open the Atlas import panel',
    '- **Guide me through the migration workflow** — step-by-step with **Next step** buttons',
    '- **import oracle example** (also analytics, cms, iot, ledger, mobile, catalog, personalization, singleview)',
    '',
    '### Canvas & schema tools',
    '- `/fold child -> parent [array|single]` — embed a child table into a parent collection',
    '- `/guardrails` or **Check Guardrails** — migration risk analysis on the ERD',
    '- `/translate` or **Translate SQL** — open Query Translator',
    '- `/highlight table1 table2` — focus tables on the canvas',
    '- `/clear-overrides` — reset embed overrides',
    '- **Optimize Schema** — architecture review of the current design (use **Save to Drive** on the review to open in Google Docs)',
    '',
    '### MongoDB inspect (Atlas)',
    '- **list databases** / **show me databases**',
    '- **list collections from `{db}`** / **list collections in `{db}`**',
    '- **describe `{db}.{collection}`** / **describe `{collection}` in `{db}`**',
    '- **show schema for `{db}.{collection}`**',
    '- Natural language also works for indexes, find, aggregate, explain, and compare-to-plan',
    '',
    'Use logical database names only (e.g. `csv_to_atlas`). After workflow or inspect tools run, use **Next step** on the tool card to continue.',
  ].join('\n');
}
