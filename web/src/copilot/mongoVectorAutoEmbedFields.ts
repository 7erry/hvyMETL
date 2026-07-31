/** Infer string field paths from BSON type labels shown in schema inspect tables. */
export function inferTextFieldPathsFromSchemaTypes(
  fields: Array<{ path: string; types: string }>,
): string[] {
  return fields
    .filter((field) => /\bstring\b/i.test(field.types))
    .map((field) => field.path);
}
