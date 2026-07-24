/** One flattened field row from an inferred MongoDB collection schema. */
export type MongoSchemaFieldRow = {
  path: string;
  types: string;
};

/** Normalized collection schema payload returned by inspect tools. */
export type MongoCollectionSchemaSummary = {
  database: string;
  collection: string;
  fieldsCount: number;
  fields: MongoSchemaFieldRow[];
};

/** Format a BSON type value (string or union array) for display. */
function formatBsonTypeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))].sort();
    return parts.length ? parts.join(' | ') : 'unknown';
  }
  return 'unknown';
}

/** Recursively flatten JSON Schema properties from MCP collection-schema output. */
export function flattenInferredSchemaFields(schema: unknown, prefix = ''): MongoSchemaFieldRow[] {
  if (!schema || typeof schema !== 'object') return [];

  const record = schema as Record<string, unknown>;
  const properties =
    record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : !record.bsonType && !record.items && Object.keys(record).length > 0
        ? record
        : null;

  if (!properties) {
    if (prefix && record.bsonType !== undefined) {
      return [{ path: prefix, types: formatBsonTypeValue(record.bsonType) }];
    }
    return [];
  }

  const rows: MongoSchemaFieldRow[] = [];
  for (const [name, definition] of Object.entries(properties).sort(([left], [right]) => left.localeCompare(right))) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (!definition || typeof definition !== 'object') continue;

    const field = definition as Record<string, unknown>;
    const bsonType = field.bsonType;

    if (field.properties && typeof field.properties === 'object') {
      rows.push({ path, types: formatBsonTypeValue(bsonType ?? 'object') });
      rows.push(...flattenInferredSchemaFields(field, path));
      continue;
    }

    if (field.items && typeof field.items === 'object') {
      const itemField = field.items as Record<string, unknown>;
      const itemType = formatBsonTypeValue(itemField.bsonType ?? 'unknown');
      rows.push({ path, types: `${formatBsonTypeValue(bsonType ?? 'array')}<${itemType}>` });
      if (itemField.properties && typeof itemField.properties === 'object') {
        rows.push(...flattenInferredSchemaFields(field.items, `${path}[]`));
      }
      continue;
    }

    rows.push({ path, types: formatBsonTypeValue(bsonType) });
  }

  return rows;
}

/** Normalize raw MCP collection-schema output for UI and summaries. */
export function normalizeCollectionSchemaPayload(
  logicalDatabase: string,
  collection: string,
  raw: unknown,
): MongoCollectionSchemaSummary {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const schema = payload.schema;
  const fields = flattenInferredSchemaFields(schema);
  const fieldsCount =
    typeof payload.fieldsCount === 'number' && Number.isFinite(payload.fieldsCount)
      ? payload.fieldsCount
      : fields.length;

  return {
    database: logicalDatabase,
    collection,
    fieldsCount,
    fields,
  };
}
