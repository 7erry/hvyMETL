/** Heuristic self-healing suggestions from pipeline error logs. */
export function suggestPipelineSelfHeal(errors: string[]): string | undefined {
  const text = errors.join('\n').toLowerCase();
  if (/primary key|missing.*_id|duplicate key/.test(text)) {
    return 'Add CSV exports or SQLite upload for row stats, then set Embed Overrides max-children before re-running.';
  }
  if (/type coercion|cannot cast|invalid bson|datetime|timestamptz/.test(text)) {
    return 'Use setEmbedOverride to map TIMESTAMPTZ columns to Date, or adjust field types in embed overrides.';
  }
  if (/413|payload too large|document.*16/.test(text)) {
    return 'Run guardrails and detach high-volume child tables (e.g. telemetry) from parent embeds using /fold or detachTable.';
  }
  if (/foreign key|reference/.test(text)) {
    return 'Verify orphan FK relationships in guardrails and fix missing parent tables in the source schema.';
  }
  return undefined;
}
