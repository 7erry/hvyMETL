/** True when inferred BSON types allow Atlas autoEmbed on this field path. */
export function fieldTypesAllowAutoEmbed(types: string): boolean {
  const normalized = types.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return true;
  return /\bstring\b/.test(normalized);
}

/** Infer string field paths from BSON type labels shown in schema inspect tables. */
export function inferTextFieldPathsFromSchemaTypes(
  fields: Array<{ path: string; types: string }>,
): string[] {
  return fields
    .filter((field) => fieldTypesAllowAutoEmbed(field.types))
    .map((field) => field.path);
}

export type SchemaFieldPickOption = {
  path: string;
  types: string;
  isStringType: boolean;
};

/** All inferred field paths for vector index field picklists (with BSON types). */
export function listSchemaFieldPickOptions(
  fields: Array<{ path: string; types: string }>,
): SchemaFieldPickOption[] {
  return fields
    .map((field) => ({
      path: field.path,
      types: field.types,
      isStringType: fieldTypesAllowAutoEmbed(field.types),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function formatSchemaFieldPickLabel(option: SchemaFieldPickOption): string {
  return `${option.path} (${option.types})`;
}
