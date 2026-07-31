/** Infer string field paths from BSON type labels shown in schema inspect tables. */
export function inferTextFieldPathsFromSchemaTypes(
  fields: Array<{ path: string; types: string }>,
): string[] {
  return fields
    .filter((field) => /\bstring\b/i.test(field.types))
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
      isStringType: /\bstring\b/i.test(field.types),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function formatSchemaFieldPickLabel(option: SchemaFieldPickOption): string {
  return `${option.path} (${option.types})`;
}
