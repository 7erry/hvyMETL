/**
 * Naming helpers used when translating SQL identifiers (snake_case tables
 * and columns) into MongoDB conventions (camelCase fields and collections).
 */

/**
 * Convert "snake_case_name" to "snakeCaseName". Names that are already
 * camelCase pass through unchanged (only underscores trigger rewriting).
 */
export function toCamelCase(name: string): string {
  const camel = name.replace(/_+(\w)/g, (_, letter: string) => letter.toUpperCase());
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

/** Convert "snake_case_name" to "SnakeCaseName". */
export function toPascalCase(name: string): string {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Very small singularizer for table names ("reviews" -> "review",
 * "categories" -> "category"). Only handles the common English suffixes the
 * example schemas use; unknown words pass through unchanged.
 */
export function singularize(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}
