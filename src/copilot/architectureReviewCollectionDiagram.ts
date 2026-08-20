import type { CollectionPlan, MigrationPlan } from '../types.js';

type JsonSchemaProperty = {
  bsonType?: string | string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  maxItems?: number;
};

type CollectionFieldRow = {
  name: string;
  bsonType: string;
  tags: string[];
};

const FIELD_TAG_GLYPH: Record<string, string> = {
  id: '🔑',
  embed: '⊕',
  denorm: '⇢',
  computed: 'ƒ',
  bucket: '⏱',
  index: '◆',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function fieldsForCollection(collection: CollectionPlan): CollectionFieldRow[] {
  const schema = collection.jsonSchema as { properties?: Record<string, JsonSchemaProperty> };
  const props = schema.properties ?? {};
  const indexedFields = new Set<string>();
  for (const index of collection.indexes) {
    for (const key of Object.keys(index.keys)) indexedFields.add(key);
  }
  const computed = new Set(collection.computedFields.map((field) => field.field));
  const embedded = new Set(collection.embeddedArrays.map((entry) => entry.field));
  const extended = new Set(collection.extendedReferences.map((entry) => entry.field));
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

function fieldTagPrefix(tags: string[]): string {
  for (const tag of ['id', 'embed', 'denorm', 'computed', 'bucket', 'index']) {
    if (tags.includes(tag)) {
      const glyph = FIELD_TAG_GLYPH[tag];
      return glyph ? `${glyph} ` : '';
    }
  }
  return '';
}

function collectionDiagramCardHtml(collection: CollectionPlan): string {
  const fields = fieldsForCollection(collection);
  const merged = collection.mergedTables.filter((table) => table !== collection.sourceTable);
  const patternLabels = [...new Set(collection.patterns.map((entry) => entry.pattern))].slice(0, 3);
  const fieldRows = fields
    .map((field) => {
      const tagClass = [
        field.tags.includes('id') ? 'collection-diagram__field--id' : '',
        field.tags.includes('embed') ? 'collection-diagram__field--embed' : '',
        field.tags.includes('denorm') ? 'collection-diagram__field--denorm' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<tr class="${tagClass}">
  <td class="collection-diagram__field-name">${escapeHtml(`${fieldTagPrefix(field.tags)}${field.name}`)}</td>
  <td class="collection-diagram__field-type">${escapeHtml(field.bsonType)}</td>
</tr>`;
    })
    .join('\n');

  const patternsHtml =
    patternLabels.length > 0
      ? `<div class="collection-diagram__patterns">${patternLabels
          .map((pattern) => `<span class="collection-diagram__pattern">${escapeHtml(pattern)}</span>`)
          .join('')}</div>`
      : '';

  const mergedHtml =
    merged.length > 0
      ? `<p class="collection-diagram__merged">+ ${escapeHtml(merged.join(', '))}</p>`
      : '';

  const archiveHtml = collection.archive
    ? `<p class="collection-diagram__archive">archive → ${escapeHtml(collection.archive.archiveCollection)}</p>`
    : '';

  return `<article class="collection-diagram">
  <header class="collection-diagram__header">
    <span class="collection-diagram__name">${escapeHtml(collection.name)}</span>
    <span class="collection-diagram__badge">MongoDB</span>
  </header>
  <p class="collection-diagram__source">from ${escapeHtml(collection.sourceTable)}</p>
  ${mergedHtml}
  ${patternsHtml}
  <table class="collection-diagram__fields" cellpadding="4" cellspacing="0">
    <thead><tr><th>Field</th><th>BSON type</th></tr></thead>
    <tbody>${fieldRows}</tbody>
  </table>
  ${archiveHtml}
</article>`;
}

/** HTML block listing one Migration Studio-style collection card per plan collection. */
export function architectureReviewCollectionDiagramsHtml(plan: MigrationPlan): string {
  if (!plan.collections.length) return '';

  const cards = plan.collections.map(collectionDiagramCardHtml).join('\n');
  return `<section class="collection-diagram-section">
  <h2>Collections diagrams</h2>
  <p class="collection-diagram-section__intro">Migration plan collection cards (After · MongoDB diagram view).</p>
  <div class="collection-diagram-grid">
${cards}
  </div>
</section>`;
}

export const ARCHITECTURE_REVIEW_COLLECTION_DIAGRAM_STYLES = `
  .collection-diagram-section { margin: 1.5rem 0 2rem; page-break-inside: avoid; }
  .collection-diagram-section__intro { color: #444; font-size: 0.95rem; margin: 0.35rem 0 1rem; }
  .collection-diagram-grid { display: block; }
  .collection-diagram {
    border: 2px solid #00684a;
    border-radius: 10px;
    background: #f8fffc;
    margin: 0 0 1.25rem;
    padding: 0;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .collection-diagram__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #023430;
    color: #e3fcf7;
    padding: 0.55rem 0.75rem;
  }
  .collection-diagram__name { font-weight: 700; font-size: 1rem; }
  .collection-diagram__badge {
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: #00684a;
    color: #fff;
    border-radius: 999px;
    padding: 0.15rem 0.45rem;
  }
  .collection-diagram__source,
  .collection-diagram__merged,
  .collection-diagram__archive {
    margin: 0.35rem 0.75rem;
    font-size: 0.82rem;
    color: #335;
  }
  .collection-diagram__patterns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0 0.75rem 0.5rem;
  }
  .collection-diagram__pattern {
    font-size: 0.72rem;
    background: #e3fcf7;
    border: 1px solid #00a35c;
    color: #023430;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
  }
  .collection-diagram__fields {
    width: calc(100% - 1.5rem);
    margin: 0.35rem 0.75rem 0.75rem;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .collection-diagram__fields th {
    text-align: left;
    background: #e3fcf7;
    border-bottom: 1px solid #00a35c;
    padding: 0.35rem 0.45rem;
  }
  .collection-diagram__fields td {
    border-bottom: 1px solid #d8efe8;
    padding: 0.3rem 0.45rem;
    vertical-align: top;
  }
  .collection-diagram__field-name { font-family: Menlo, Consolas, monospace; white-space: nowrap; }
  .collection-diagram__field-type { color: #00684a; font-family: Menlo, Consolas, monospace; font-size: 0.78rem; }
  .collection-diagram__field--id .collection-diagram__field-name { color: #0b5; }
  .collection-diagram__field--embed .collection-diagram__field-name { color: #067; }
  .collection-diagram__field--denorm .collection-diagram__field-name { color: #046; }
`;
