import type { ColumnModel, DynamoDbGsiModel, TableModel } from './types';

export type DynamoTableSection = {
  id: string;
  title: string;
  subtitle?: string;
  columns: ColumnModel[];
};

/** Human-readable role label for a DynamoDB key attribute row. */
export function formatDynamoKeyRole(column: ColumnModel): string {
  switch (column.dynamoKeyRole) {
    case 'pk-hash':
      return 'HASH';
    case 'pk-range':
      return 'RANGE';
    case 'gsi-hash':
      return 'HASH';
    case 'gsi-range':
      return 'RANGE';
    case 'ttl':
      return 'TTL';
    default:
      return '';
  }
}

/** Group DynamoDB key columns into primary-key, GSI, and TTL sections for diagram rendering. */
export function dynamoTableSections(table: TableModel): DynamoTableSection[] {
  const meta = table.dynamoDb;
  if (!meta) return [];

  const sections: DynamoTableSection[] = [];
  const pkColumns = table.columns.filter((column) => column.dynamoKeyRole?.startsWith('pk-'));
  if (pkColumns.length > 0) {
    sections.push({ id: 'primary-key', title: 'Primary key', columns: pkColumns });
  }

  for (const gsi of meta.globalSecondaryIndexes) {
    const columns = table.columns.filter((column) => column.dynamoGsiName === gsi.indexName);
    sections.push({
      id: `gsi-${gsi.indexName}`,
      title: gsi.indexName,
      subtitle: formatGsiProjection(gsi),
      columns,
    });
  }

  const ttlColumns = table.columns.filter((column) => column.dynamoKeyRole === 'ttl');
  if (ttlColumns.length > 0) {
    sections.push({
      id: 'ttl',
      title: 'Time to live',
      subtitle: meta.ttlAttribute ? `Attribute: ${meta.ttlAttribute}` : undefined,
      columns: ttlColumns,
    });
  }

  return sections;
}

function formatGsiProjection(gsi: DynamoDbGsiModel): string {
  if (gsi.projectionType === 'ALL') return 'Projection: ALL';
  if (gsi.projectionType === 'KEYS_ONLY') return 'Projection: KEYS_ONLY';
  const attrs = gsi.nonKeyAttributes?.join(', ') ?? '';
  return attrs ? `Projection: INCLUDE (${attrs})` : 'Projection: INCLUDE';
}

/** Short capability chips shown under a DynamoDB table title. */
export function dynamoTableCapabilityChips(table: TableModel): string[] {
  const meta = table.dynamoDb;
  if (!meta) return [];

  const chips: string[] = [];
  if (meta.billingMode) chips.push(meta.billingMode.replace(/_/g, ' '));
  if (meta.streamViewType) chips.push(`Stream ${meta.streamViewType.replace(/_/g, ' ')}`);
  if (meta.ttlAttribute) chips.push('TTL enabled');
  if (meta.pointInTimeRecovery) chips.push('PITR');
  if (meta.sseEnabled) chips.push('SSE');
  return chips;
}

/** Estimate diagram node height for a DynamoDB table card. */
export function estimateDynamoTableNodeHeight(table: TableModel): number {
  const sections = dynamoTableSections(table);
  const chips = dynamoTableCapabilityChips(table);
  const headerHeight = 52;
  const chipRowHeight = chips.length > 0 ? 24 : 0;
  const subtitleHeight = table.dynamoDb?.physicalTableName && table.dynamoDb.physicalTableName !== table.name ? 18 : 0;
  const sectionHeaderHeight = 22;
  const projectionSubtitleHeight = 18;
  const rowHeight = 28;
  const padding = 18;

  let bodyHeight = padding;
  for (const section of sections) {
    bodyHeight += sectionHeaderHeight;
    if (section.subtitle) bodyHeight += projectionSubtitleHeight;
    bodyHeight += section.columns.length * rowHeight;
  }

  return headerHeight + chipRowHeight + subtitleHeight + bodyHeight;
}
