import { toCamelCase } from '../../../src/utilities/naming.js';
import type { CollectionPlan, MigrationPlan } from '../migrationPlanTypes';

/** Pattern tags applied to top-level collection fields in the visualizer. */
export type SchemaFieldTag = 'id' | 'meta' | 'embed' | 'fk' | 'denorm' | 'computed' | 'bucket' | 'index';

export type JsonSchemaProperty = {
  bsonType?: string | string[];
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  maxItems?: number;
};

/** One node in the nested schema tree for inspector and ERD views. */
export type SchemaField = {
  path: string;
  name: string;
  type: string;
  tags?: SchemaFieldTag[];
  description?: string;
  children?: SchemaField[];
  embedSourceTable?: string;
};

export type CollectionTagContext = {
  indexedFields: Set<string>;
  computed: Set<string>;
  embedded: Set<string>;
  extended: Set<string>;
  bucketField?: string;
  embedByField: Map<string, { sourceTable: string; joinColumn: string }>;
};

/** Build tag lookup sets from migration-plan metadata (top-level field names only). */
export function buildCollectionTagContext(collection: CollectionPlan): CollectionTagContext {
  const indexedFields = new Set<string>();
  for (const index of collection.indexes) {
    for (const key of Object.keys(index.keys)) indexedFields.add(key);
  }
  const embedByField = new Map<string, { sourceTable: string; joinColumn: string }>();
  for (const embed of collection.embeddedArrays) {
    embedByField.set(embed.field, { sourceTable: embed.sourceTable, joinColumn: embed.joinColumn });
  }
  return {
    indexedFields,
    computed: new Set(collection.computedFields.map((f) => f.field)),
    embedded: new Set(collection.embeddedArrays.map((e) => e.field)),
    extended: new Set(collection.extendedReferences.map((e) => e.field)),
    bucketField: collection.bucket?.measurementsField,
    embedByField,
  };
}

/** Human-readable type label for one JSON Schema property definition. */
export function jsonSchemaPropertyToDisplayType(prop: JsonSchemaProperty): string {
  if (Array.isArray(prop.bsonType)) return prop.bsonType.join(' | ');
  if (prop.bsonType === 'array') {
    let inner = 'object';
    if (prop.items) {
      if (prop.items.bsonType === 'object' || prop.items.properties) {
        inner = 'object';
      } else {
        inner = jsonSchemaPropertyToDisplayType(prop.items);
      }
    }
    const cap = prop.maxItems != null ? `[≤${prop.maxItems}]` : '';
    return `array<${inner}>${cap}`;
  }
  if (prop.bsonType === 'object' && prop.properties) {
    const keys = Object.keys(prop.properties).slice(0, 3);
    const suffix = Object.keys(prop.properties).length > 3 ? ', …' : '';
    return `{ ${keys.join(', ')}${suffix} }`;
  }
  return prop.bsonType ?? 'unknown';
}

function tagsForTopLevelField(name: string, ctx: CollectionTagContext): SchemaFieldTag[] {
  const tags: SchemaFieldTag[] = [];
  if (name === '_id') tags.push('id');
  else if (name === 'schemaVersion') tags.push('meta');
  if (ctx.computed.has(name)) tags.push('computed');
  if (ctx.embedded.has(name)) tags.push('embed');
  if (ctx.extended.has(name)) tags.push('denorm');
  if (ctx.bucketField === name) tags.push('bucket');
  if (ctx.indexedFields.has(name)) tags.push('index');
  return tags;
}

function collectionForSourceTable(plan: MigrationPlan, sourceTable: string): CollectionPlan | undefined {
  return plan.collections.find((c) => c.sourceTable === sourceTable || c.name === sourceTable);
}

function childPropertiesFromSiblingCollection(
  plan: MigrationPlan,
  sourceTable: string,
  joinColumn: string,
): Record<string, JsonSchemaProperty> | undefined {
  const sibling = collectionForSourceTable(plan, sourceTable);
  if (!sibling) return undefined;
  const schema = sibling.jsonSchema as { properties?: Record<string, JsonSchemaProperty> };
  const props = schema.properties ?? {};
  const joinCamel = toCamelCase(joinColumn);
  const filtered: Record<string, JsonSchemaProperty> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === '_id' || key === joinCamel || key === joinColumn) continue;
    filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/** Deep-clone a property and hydrate stub embed array items from a sibling collection when needed. */
function hydrateEmbedProperty(
  name: string,
  prop: JsonSchemaProperty,
  ctx: CollectionTagContext,
  plan: MigrationPlan | undefined,
): JsonSchemaProperty {
  if (!ctx.embedded.has(name) || !plan) return prop;
  const meta = ctx.embedByField.get(name);
  if (!meta) return prop;

  if (prop.bsonType === 'array' && prop.items?.bsonType === 'object' && !prop.items.properties) {
    const fromSibling = childPropertiesFromSiblingCollection(plan, meta.sourceTable, meta.joinColumn);
    if (fromSibling) {
      return {
        ...prop,
        items: { ...prop.items, properties: fromSibling },
      };
    }
  }

  if (prop.bsonType === 'object' && !prop.properties) {
    const fromSibling = childPropertiesFromSiblingCollection(plan, meta.sourceTable, meta.joinColumn);
    if (fromSibling) {
      return { ...prop, properties: fromSibling };
    }
  }

  return prop;
}

function propertyToSchemaField(
  name: string,
  prop: JsonSchemaProperty,
  pathPrefix: string,
  ctx: CollectionTagContext,
  plan: MigrationPlan | undefined,
  isTopLevel: boolean,
): SchemaField {
  const path = pathPrefix ? `${pathPrefix}.${name}` : name;
  const hydrated = isTopLevel ? hydrateEmbedProperty(name, prop, ctx, plan) : prop;
  const tags = isTopLevel ? tagsForTopLevelField(name, ctx) : undefined;
  const embedMeta = isTopLevel ? ctx.embedByField.get(name) : undefined;

  const field: SchemaField = {
    path,
    name,
    type: jsonSchemaPropertyToDisplayType(hydrated),
    description: hydrated.description,
    tags: tags?.length ? tags : undefined,
    embedSourceTable: embedMeta?.sourceTable,
  };

  const objectProps =
    hydrated.bsonType === 'object' && hydrated.properties
      ? hydrated.properties
      : hydrated.bsonType === 'array' && hydrated.items?.properties
        ? hydrated.items.properties
        : undefined;

  if (objectProps) {
    field.children = Object.entries(objectProps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([childName, childProp]) =>
        propertyToSchemaField(childName, childProp, path, ctx, plan, false),
      );
  }

  return field;
}

/** Parent scalars/objects first; embedded array fields last (diagram + inspector). */
function compareTopLevelPropertyNames(
  leftName: string,
  rightName: string,
  ctx: CollectionTagContext,
): number {
  const leftEmbed = ctx.embedded.has(leftName);
  const rightEmbed = ctx.embedded.has(rightName);
  if (leftEmbed !== rightEmbed) return leftEmbed ? 1 : -1;
  return leftName.localeCompare(rightName);
}

/** Build a nested schema tree from a collection's $jsonSchema and plan metadata. */
export function schemaFieldsFromCollection(
  collection: CollectionPlan,
  plan?: MigrationPlan | null,
): SchemaField[] {
  const ctx = buildCollectionTagContext(collection);
  const schema = collection.jsonSchema as { properties?: Record<string, JsonSchemaProperty> };
  const props = schema.properties ?? {};
  const planArg = plan ?? undefined;

  return Object.entries(props)
    .sort(([left], [right]) => compareTopLevelPropertyNames(left, right, ctx))
    .map(([name, prop]) => propertyToSchemaField(name, prop, '', ctx, planArg, true));
}

/** Flatten a schema tree to dot-path rows (for legacy flat tables and copilot hints). */
export function flattenSchemaFields(fields: SchemaField[]): Array<{
  path: string;
  name: string;
  type: string;
  tags: string[];
}> {
  const rows: Array<{ path: string; name: string; type: string; tags: string[] }> = [];

  function walk(nodes: SchemaField[], inheritedTags: string[]): void {
    for (const node of nodes) {
      const tags = node.tags?.length ? [...node.tags] : inheritedTags;
      rows.push({
        path: node.path,
        name: node.path,
        type: node.type,
        tags,
      });
      if (node.children?.length) {
        walk(node.children, tags);
      }
    }
  }

  walk(fields, []);
  return rows;
}
