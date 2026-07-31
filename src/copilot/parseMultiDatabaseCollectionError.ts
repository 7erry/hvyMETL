/**
 * Parses inspect errors when a collection name exists in more than one logical database.
 */

/** Extract logical database names from a multi-database inspect error message. */
export function parseMultiDatabaseCollectionError(message: string): string[] | null {
  const match = message.match(/exists in multiple databases \(([^)]+)\)/i);
  if (!match?.[1]) return null;

  const names = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return names.length > 1 ? names : null;
}
