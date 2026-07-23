/** Detects general copilot capability / help questions. */
export function isCopilotHelpQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return /^(?:how\s+(?:can|do)\s+you\s+help(?:\s+me)?|what\s+can\s+you\s+(?:help(?:\s+me)?\s+with|do)|what\s+do\s+you\s+do)\??$/i.test(
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
    '**Try:** Guide me through the migration workflow',
    '',
    'Or use quick actions below, slash commands like `/refresh-design`, or ask naturally (e.g. *show me databases*).',
  ].join('\n');
}
