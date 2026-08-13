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

/** Normalize MongoDB analyzer / MCP bson type labels to lowercase jsonSchema names. */
function normalizeAnalyzerBsonTypeLabel(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case 'string':
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
    case 'bool':
    case 'boolean':
    case 'date':
    case 'object':
    case 'array':
    case 'binData':
    case 'objectId':
    case 'null':
      return normalized === 'boolean' ? 'bool' : normalized;
    default:
      return normalized;
  }
}

/** Flatten MongoDB analyzer \`fields: [{ path, types }]\` payloads from collection-schema MCP. */
export function flattenAnalyzerSchemaFields(fields: unknown): MongoSchemaFieldRow[] {
  if (!Array.isArray(fields)) return [];
  const rows: MongoSchemaFieldRow[] = [];
  for (const entry of fields) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const pathParts = Array.isArray(record.path)
      ? record.path.map((part) => String(part).trim()).filter(Boolean)
      : typeof record.name === 'string'
        ? [record.name.trim()]
        : [];
    if (!pathParts.length) continue;
    const path = pathParts.join('.');
    const typeTokens = new Set<string>();
    if (Array.isArray(record.types)) {
      for (const typeEntry of record.types) {
        if (!typeEntry || typeof typeEntry !== 'object') continue;
        const bsonType = (typeEntry as { bsonType?: unknown }).bsonType;
        if (typeof bsonType === 'string') typeTokens.add(normalizeAnalyzerBsonTypeLabel(bsonType));
      }
    }
    if (typeof record.bsonType === 'string') {
      typeTokens.add(normalizeAnalyzerBsonTypeLabel(record.bsonType));
    }
    rows.push({
      path,
      types: typeTokens.size ? formatBsonTypeUnion([...typeTokens]) : 'unknown',
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

/** Flatten migration-plan $jsonSchema into inspect-style field rows. */
export function flattenMigrationPlanCollectionSchema(jsonSchema: unknown): MongoSchemaFieldRow[] {
  if (!jsonSchema || typeof jsonSchema !== 'object') return [];
  return flattenInferredSchemaFields(jsonSchema);
}

/** Prefer plan types when Atlas/MCP inference returns unknown or omits nested paths. */
export function mergeInferredSchemaWithPlan(
  inferred: MongoSchemaFieldRow[],
  plan: MongoSchemaFieldRow[],
): MongoSchemaFieldRow[] {
  if (!plan.length) return inferred;
  if (!inferred.length) return plan;

  const planByPath = new Map(plan.map((row) => [row.path, row.types]));
  const mergedPaths = new Set<string>();
  const merged = inferred.map((row) => {
    mergedPaths.add(row.path);
    const planType = planByPath.get(row.path);
    return {
      path: row.path,
      types: row.types === 'unknown' && planType ? planType : row.types,
    };
  });

  for (const planRow of plan) {
    if (mergedPaths.has(planRow.path)) continue;
    merged.push(planRow);
    mergedPaths.add(planRow.path);
  }

  return merged.sort((left, right) => left.path.localeCompare(right.path));
}

/** Format a BSON type value (string or union array) for display. */
function formatBsonTypeUnion(parts: string[]): string {
  const unique = [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
  if (!unique.length) return 'unknown';
  const nonNull = unique.filter((part) => part !== 'null');
  const hasNull = unique.includes('null');
  if (!nonNull.length) return 'null';
  const ordered = [...nonNull];
  if (hasNull) ordered.push('null');
  return ordered.join(' | ');
}

function formatBsonTypeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.filter((entry): entry is string => typeof entry === 'string');
    return parts.length ? formatBsonTypeUnion(parts) : 'unknown';
  }
  return 'unknown';
}

function collectBsonTypeTokens(value: unknown, tokens: Set<string>): void {
  if (typeof value === 'string') {
    tokens.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') tokens.add(entry);
    }
  }
}

/** Infer a display type label from one JSON Schema field definition (incl. anyOf/nullable). */
function inferBsonTypesFromFieldDefinition(field: Record<string, unknown>): string {
  const tokens = new Set<string>();

  if (field.bsonType !== undefined) {
    collectBsonTypeTokens(field.bsonType, tokens);
  }
  if (typeof field.type === 'string') {
    tokens.add(field.type);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = field[key];
    if (!Array.isArray(branches)) continue;
    for (const branch of branches) {
      if (!branch || typeof branch !== 'object') continue;
      const record = branch as Record<string, unknown>;
      if (record.bsonType !== undefined) {
        collectBsonTypeTokens(record.bsonType, tokens);
      }
      if (typeof record.type === 'string') {
        tokens.add(record.type);
      }
    }
  }

  const parts = [...tokens];
  if (parts.length) return formatBsonTypeUnion(parts);
  if (field.properties && typeof field.properties === 'object') return 'object';
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

    rows.push({ path, types: inferBsonTypesFromFieldDefinition(field) });
  }

  return rows;
}

/** Normalize raw MCP collection-schema output for UI and summaries. */
export function normalizeCollectionSchemaPayload(
  logicalDatabase: string,
  collection: string,
  raw: unknown,
  planSchema?: unknown,
): MongoCollectionSchemaSummary {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const analyzerFields = flattenAnalyzerSchemaFields(payload.fields);
  const inferredFields =
    analyzerFields.length > 0 ? analyzerFields : flattenInferredSchemaFields(payload.schema);
  const planFields = flattenMigrationPlanCollectionSchema(planSchema);
  const fields = mergeInferredSchemaWithPlan(inferredFields, planFields);
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
