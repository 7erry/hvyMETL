/** Inspect placeholders that are not real database or collection names. */
export const INSPECT_PLACEHOLDER_DATABASE = 'database';
export const INSPECT_PLACEHOLDER_COLLECTION = 'collection';

/** Drop empty or inspect placeholder database hints. */
export function normalizeVectorIndexDatabaseHint(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === INSPECT_PLACEHOLDER_DATABASE) return '';
  return trimmed;
}

/** Drop empty or inspect placeholder collection hints. */
export function normalizeVectorIndexCollectionHint(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === INSPECT_PLACEHOLDER_COLLECTION) return '';
  return trimmed;
}

/** Pick the first name that exists in options, otherwise the list head. */
export function pickInitialCatalogName(options: string[], preferred: string[]): string {
  for (const name of preferred) {
    if (name && options.includes(name)) return name;
  }
  return options[0] ?? '';
}

/** Merge API collection names with migration-plan collection names (stable sort). */
export function mergeCollectionNameOptions(apiNames: string[], planNames: string[]): string[] {
  return [...new Set([...apiNames, ...planNames])].sort((left, right) => left.localeCompare(right));
}
