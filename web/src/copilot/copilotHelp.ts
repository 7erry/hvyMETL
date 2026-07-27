import {
  buildMigrationWorkflowGuideLink,
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
    '2. **Import SQL** — paste DDL or load a built-in example',
    `3. ${buildWorkflowActionLink('Refresh design', 'refreshDesign')} — generate the MongoDB target schema (ML/RAG)`,
    `4. ${buildWorkflowActionLink('Run pipeline', 'runPipeline')} — load CSV/SQLite data into Atlas`,
    '5. **Inspect Atlas** — list databases and collections, compare to plan',
    '',
    'I also fold embeds on the ERD, run guardrails, translate SQL queries, and explain MongoDB operations.',
    '',
    'After each workflow step, click **Next step** on the tool card or the linked step in the message.',
    '',
    `**Try:** ${buildMigrationWorkflowGuideLink()}`,
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
    `- \`/clear-session\` or ${buildWorkflowActionLink('clear session', 'clearSession')} — wipe session and open schema import`,
    `- \`/refresh-design\` or ${buildWorkflowActionLink('refresh design', 'refreshDesign')} — regenerate MongoDB target schema`,
    `- \`/run-pipeline\` or ${buildWorkflowActionLink('run pipeline', 'runPipeline')} — open the Atlas import panel`,
    `- ${buildMigrationWorkflowGuideLink()} — step-by-step with clickable **Next step** links`,
    '- **import oracle example** (also analytics, cms, iot, ledger, mobile, catalog, personalization, singleview)',
    '',
    '### Canvas & schema tools',
    '- `/fold child -> parent [array|single]` — embed a child table into a parent collection',
    '- `/guardrails` or **Check Guardrails** — migration risk analysis on the ERD',
    '- `/translate` or **Translate SQL** — open Query Translator',
    '- `/highlight table1 table2` — focus tables on the canvas',
    '- `/clear-overrides` — reset embed overrides',
    '- **Optimize Schema** — architecture review of the current design (use **Save to Google Docs** on the review to export to Drive)',
    '',
    '### MongoDB inspect (Atlas)',
    '- **list databases** / **show me databases**',
    '- **list collections from `{db}`** / **list collections in `{db}`**',
    '- **describe `{db}.{collection}`** / **describe `{collection}` in `{db}`**',
    '- **show schema for `{db}.{collection}`**',
    '- **find in `{db}.{collection}` where `{field}` `{op}` `{value}`** (e.g. *find in finops.accounts where current balance > 9000*)',
    '- **count in `{db}.{collection}` where …** — total matches via aggregation',
    '- Natural language also works for indexes, aggregate, explain, and compare-to-plan',
    '',
    'Use logical database names only (e.g. `csv_to_atlas`). After workflow or inspect tools run, click **Next step** on the tool card or the linked step in the message.',
    '',
    '### Manager dataset scale',
    '- **what is the current raw data size?** / **dataset scale — raw data** — reports Manager slider override or schema estimate',
    '- Manager **Dataset scale — raw data** (up to 21 TB) feeds Atlas sizing and sharding guidance in architecture reviews when CSV row counts are unavailable',
  ].join('\n');
}
