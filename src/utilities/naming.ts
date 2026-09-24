/**
 * Naming helpers used when translating SQL identifiers (snake_case tables
 * and columns) into MongoDB conventions (camelCase fields and collections).
 */

/**
 * Convert SQL-style identifiers to camelCase MongoDB field/collection names.
 *
 * - snake_case: `order_items` → `orderItems`
 * - ALL_CAPS (Oracle/SQL Server): `REGIONS` → `regions`, `ORDER_ITEMS` → `orderItems`
 * - already camelCase / mixed: only lowercases the first character
 */
export function toCamelCase(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  // Uppercase identifiers without lowercase letters — avoid REGIONS → rEGIONS.
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    return lower.replace(/_+([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  }

  const camel = trimmed.replace(/_+(\w)/g, (_, letter: string) => letter.toUpperCase());
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

/** Convert "snake_case_name" to "SnakeCaseName". */
export function toPascalCase(name: string): string {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** csvToAtlas / MongoDB collection names: letter or underscore start, alphanumeric + underscore only. */
export const MONGO_COLLECTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Build a valid MongoDB collection name from a SQL table identifier.
 * Schema-qualified PostgreSQL names (`ion_user.users`) become `ionUser_users`
 * instead of `ionUser.users`, which csvToAtlas rejects.
 */
export function mongoCollectionNameFromTable(tableName: string): string {
  const trimmed = tableName.trim();
  if (!trimmed) return trimmed;

  const segments = trimmed
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) return toCamelCase(trimmed);

  return segments.map((segment) => toCamelCase(segment)).join('_');
}

/**
 * Normalize a migration plan collection name for csvToAtlas import when legacy
 * plans still contain dots from older naming.
 */
export function normalizeMongoCollectionName(name: string, sourceTable?: string): string {
  if (MONGO_COLLECTION_NAME_PATTERN.test(name)) return name;
  if (sourceTable?.includes('.')) return mongoCollectionNameFromTable(sourceTable);
  const sanitized = name.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!sanitized || !MONGO_COLLECTION_NAME_PATTERN.test(sanitized)) {
    throw new Error(`Invalid MongoDB collection name "${name}".`);
  }
  return sanitized;
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
