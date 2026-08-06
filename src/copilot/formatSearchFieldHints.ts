import type { CopilotSearchFieldHint } from './groveChat.js';

/** Renders migration-plan search field hints for the Grove system prompt. */
export function formatSearchFieldHintsForSystemPrompt(
  hints: CopilotSearchFieldHint[] | undefined,
): string {
  if (!hints?.length) {
    return '(no field-based search hints — infer from collection jsonSchema in the migration plan when writing §6)';
  }

  const lines = hints.map(
    (hint) =>
      `- **${hint.collection}.${hint.field}** → ${hint.kind}: ${hint.summary}`,
  );
  return lines.join('\n');
}
