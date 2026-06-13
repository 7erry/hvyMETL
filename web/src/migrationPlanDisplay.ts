import type { CollectionPlan, MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel } from './types';

type JsonSchemaProperty = {
  bsonType?: string | string[];
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  maxItems?: number;
};

/** One row shown on a collection node in the MongoDB diagram. */
export type CollectionFieldRow = {
  name: string;
  bsonType: string;
  tags: string[];
};

export type MongoCollectionEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label: string;
  kind: 'embed' | 'overflow' | 'extended' | 'archive' | 'reference';
};

/** Human-readable SQL → MongoDB transform line for the After diagram bar. */
export function formatTransformSummary(meta: {
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
}): string {
  const { sqlTableCount, collectionCount, foldedTableCount } = meta;
  if (foldedTableCount > 0) {
    return `${sqlTableCount} SQL tables → ${collectionCount} MongoDB collections (${foldedTableCount} folded)`;
  }
  return `${sqlTableCount} SQL tables → ${collectionCount} MongoDB collections`;
}

/** Derive transform summary from model + plan when server meta is unavailable. */
export function designMetaFromPlan(
  model: SqlStructuralModel,
  plan: MigrationPlan,
): {
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
  foldedTables: string[];
  hasRowStats: boolean;
  csvEnriched: boolean;
} {
  const sourceTables = new Set(plan.collections.map((collection) => collection.sourceTable));
  const foldedTables = model.tables.map((table) => table.name).filter((name) => !sourceTables.has(name));
  return {
    sqlTableCount: model.tables.length,
    collectionCount: plan.collections.length,
    foldedTableCount: foldedTables.length,
    foldedTables,
    hasRowStats: model.tables.some((table) => table.rowCount > 0),
    csvEnriched: false,
  };
}

export function parseMigrationPlan(planJson: string | null | undefined): MigrationPlan | null {
  if (!planJson?.trim()) return null;
  try {
    return JSON.parse(planJson) as MigrationPlan;
  } catch {
    return null;
  }
}

function formatBsonType(prop: JsonSchemaProperty): string {
  if (Array.isArray(prop.bsonType)) return prop.bsonType.join(' | ');
  if (prop.bsonType === 'array') {
    const inner = prop.items ? formatBsonType(prop.items) : 'object';
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

/** Flatten jsonSchema.properties into display rows with pattern tags. */
export function fieldsForCollection(collection: CollectionPlan): CollectionFieldRow[] {
  const schema = collection.jsonSchema as { properties?: Record<string, JsonSchemaProperty> };
  const props = schema.properties ?? {};
  const indexedFields = new Set<string>();
  for (const index of collection.indexes) {
    for (const key of Object.keys(index.keys)) indexedFields.add(key);
  }
  const computed = new Set(collection.computedFields.map((f) => f.field));
  const embedded = new Set(collection.embeddedArrays.map((e) => e.field));
  const extended = new Set(collection.extendedReferences.map((e) => e.field));
  const bucketField = collection.bucket?.measurementsField;

  const rows: CollectionFieldRow[] = [];
  for (const [name, prop] of Object.entries(props)) {
    const tags: string[] = [];
    if (name === '_id') tags.push('id');
    else if (name === 'schemaVersion') tags.push('meta');
    if (computed.has(name)) tags.push('computed');
    if (embedded.has(name)) tags.push('embed');
    if (extended.has(name)) tags.push('denorm');
    if (bucketField === name) tags.push('bucket');
    if (indexedFields.has(name)) tags.push('index');
    rows.push({ name, bsonType: formatBsonType(prop), tags });
  }
  return rows;
}

function collectionByName(plan: MigrationPlan): Map<string, CollectionPlan> {
  return new Map(plan.collections.map((c) => [c.name, c]));
}

function collectionForTable(plan: MigrationPlan, tableName: string): CollectionPlan | undefined {
  return plan.collections.find((c) => c.name === tableName || c.sourceTable === tableName);
}

/** Build relationship edges between MongoDB collections for the diagram. */
export function edgesForPlan(plan: MigrationPlan): MongoCollectionEdge[] {
  const names = new Set(plan.collections.map((c) => c.name));
  const byName = collectionByName(plan);
  const edges: MongoCollectionEdge[] = [];

  for (const collection of plan.collections) {
    for (const embed of collection.embeddedArrays) {
      if (embed.overflowCollection && names.has(embed.overflowCollection)) {
        edges.push({
          id: `${collection.name}.${embed.field}->overflow:${embed.overflowCollection}`,
          source: collection.name,
          target: embed.overflowCollection,
          sourceHandle: `${embed.field}-out`,
          targetHandle: `${embed.overflowCollection}-in`,
          label: `${embed.field}[] overflow`,
          kind: 'overflow',
        });
      } else {
        const child = collectionForTable(plan, embed.sourceTable);
        if (child && child.name !== collection.name && names.has(child.name)) {
          edges.push({
            id: `${collection.name}.${embed.field}->embed:${child.name}`,
            source: collection.name,
            target: child.name,
            sourceHandle: `${embed.field}-out`,
            targetHandle: `${child.name}-in`,
            label: `${embed.field}[] embed`,
            kind: 'embed',
          });
        }
      }
    }

    for (const ext of collection.extendedReferences) {
      const lookup = collectionForTable(plan, ext.sourceTable);
      if (lookup && lookup.name !== collection.name && names.has(lookup.name)) {
        edges.push({
          id: `${collection.name}.${ext.field}->ext:${lookup.name}`,
          source: collection.name,
          target: lookup.name,
          sourceHandle: `${ext.field}-out`,
          targetHandle: `${lookup.name}-in`,
          label: `${ext.field} denorm`,
          kind: 'extended',
        });
      }
    }

    if (collection.archive?.archiveCollection && names.has(collection.archive.archiveCollection)) {
      edges.push({
        id: `${collection.name}->archive:${collection.archive.archiveCollection}`,
        source: collection.name,
        target: collection.archive.archiveCollection,
        sourceHandle: `${collection.name}-archive-out`,
        targetHandle: `${collection.archive.archiveCollection}-in`,
        label: `archive (${collection.archive.archiveAfterDays}d)`,
        kind: 'archive',
      });
    }
  }

  // Reference edges: collections whose sourceTable is referenced via FK in merged parent
  for (const collection of plan.collections) {
    for (const merged of collection.mergedTables) {
      if (merged === collection.sourceTable) continue;
      const ref = byName.get(merged) ?? collectionForTable(plan, merged);
      if (ref && ref.name !== collection.name && names.has(ref.name)) {
        const edgeId = `${ref.name}->ref:${collection.name}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: ref.name,
            target: collection.name,
          sourceHandle: `${ref.name}-header-out`,
          targetHandle: `${collection.name}-in`,
            label: 'reference',
            kind: 'reference',
          });
        }
      }
    }
  }

  return edges;
}

/** Collections linked to the selection via embed, overflow, archive, or denorm edges. */
export function relatedCollectionNames(plan: MigrationPlan, selected: string | null): Set<string> {
  const related = new Set<string>();
  if (!selected) return related;
  related.add(selected);
  for (const edge of edgesForPlan(plan)) {
    if (edge.source === selected) related.add(edge.target);
    if (edge.target === selected) related.add(edge.source);
  }
  return related;
}

/** Initial canvas positions: inherit from SQL table layout when sourceTable matches. */
export function initialCollectionPositions(
  plan: MigrationPlan,
  sqlPositions: Record<string, { x: number; y: number }>,
  saved: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = { ...saved };
  plan.collections.forEach((collection, index) => {
    if (positions[collection.name]) return;
    const fromSql = sqlPositions[collection.sourceTable];
    if (fromSql) {
      positions[collection.name] = { x: fromSql.x + 20, y: fromSql.y + 20 };
      return;
    }
    const col = index % 4;
    const row = Math.floor(index / 4);
    positions[collection.name] = { x: col * 300 + 40, y: row * 260 + 40 };
  });
  return positions;
}
