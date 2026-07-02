import type { MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel, TableModel } from './types';

/** Manager-friendly workload preset (maps to read/write ratios). */
export type ManagerWorkloadType = 'read-heavy' | 'balanced' | 'write-heavy';

export type ManagerCostInputs = {
  estimatedTotalRows: number;
  /** Optional raw data-size override in GB for manager scenario modeling. */
  estimatedDataGb: number;
  workloadType: ManagerWorkloadType;
  growthRatePercent: number;
  /** Per-collection hot retention before Online Archive moves older documents cold. */
  collectionRetentionYears: Record<string, number>;
};

export type AtlasTierSpec = {
  id: string;
  label: string;
  ramGb: number;
  storageGb: number;
  monthlyUsd: number;
};

export type ManagerCostProjection = {
  hasSchema: boolean;
  workloadLabel: string;
  readPercent: number;
  writePercent: number;
  estimatedTotalRows: number;
  averageDocumentBytes: number;
  rawDataGb: number;
  activeStorageGb: number;
  archiveStorageGb: number;
  totalStorageGb: number;
  indexCount: number;
  requiredRamGb: number;
  recommendedTier: AtlasTierSpec;
  workingSetPercent: number;
  monthlyComputeUsd: number;
  monthlyBackupUsd: number;
  monthlyArchiveUsd: number;
  monthlyTotalUsd: number;
  baselineMonthlyTotalUsd: number;
  monthlySavingsUsd: number;
  savingsPercent: number;
  oneTimeEgressUsd: number;
  growthRatePercent: number;
  projectedMonthlyNextYearUsd: number;
  archiveCollectionCount: number;
  archiveHotDataPercent: number;
};

export type ArchiveCollectionOption = {
  collectionName: string;
  sourceTable: string;
  timeField: string;
  retentionYears: number;
  isEnabled: boolean;
  isPlanned: boolean;
  partitionFields: string[];
};

export const DEFAULT_MANAGER_COST_INPUTS: ManagerCostInputs = {
  estimatedTotalRows: 10_000_000,
  estimatedDataGb: 0,
  workloadType: 'read-heavy',
  growthRatePercent: 15,
  collectionRetentionYears: {},
};

/** Representative MongoDB Atlas dedicated cluster tiers (USD/month, illustrative). */
export const ATLAS_CLUSTER_TIERS: AtlasTierSpec[] = [
  { id: 'M10', label: 'M10', ramGb: 2, storageGb: 10, monthlyUsd: 57 },
  { id: 'M20', label: 'M20', ramGb: 4, storageGb: 20, monthlyUsd: 140 },
  { id: 'M30', label: 'M30', ramGb: 8, storageGb: 40, monthlyUsd: 182.5 },
  { id: 'M40', label: 'M40', ramGb: 16, storageGb: 80, monthlyUsd: 280 },
  { id: 'M50', label: 'M50', ramGb: 32, storageGb: 128, monthlyUsd: 570 },
];

const BSON_OVERHEAD = 1.25;
const INDEX_OVERHEAD_FACTOR = 0.08;
const BACKUP_USD_PER_GB = 0.6;
const EGRESS_USD_PER_GB = 0.09;
const ARCHIVE_STORAGE_USD_PER_GB = 0.025;
const ARCHIVE_ASSUMED_HISTORY_YEARS = 7;
const DEFAULT_ARCHIVE_RETENTION_YEARS = 5;
const MIN_ARCHIVE_RETENTION_YEARS = 1;
const MAX_ARCHIVE_RETENTION_YEARS = 10;
const BYTES_PER_GB = 1024 ** 3;

const WORKLOAD_PRESETS: Record<
  ManagerWorkloadType,
  { label: string; readPercent: number; writePercent: number; ramRatio: number }
> = {
  'read-heavy': {
    label: 'Read-heavy (80/20)',
    readPercent: 80,
    writePercent: 20,
    ramRatio: 0.2,
  },
  balanced: {
    label: 'Balanced (50/50)',
    readPercent: 50,
    writePercent: 50,
    ramRatio: 0.3,
  },
  'write-heavy': {
    label: 'Write-heavy (50/50)',
    readPercent: 50,
    writePercent: 50,
    ramRatio: 0.4,
  },
};

/** Heuristic byte width from SQL column type for storage sizing. */
export function estimateColumnBytes(sqlType: string): number {
  const t = sqlType.toLowerCase().trim();
  if (t.includes('bigint')) return 8;
  if (t.includes('smallint')) return 2;
  if (t.includes('int') || t.includes('serial')) return 4;
  if (t.includes('bool')) return 1;
  if (t.includes('uuid')) return 16;
  if (t.includes('decimal') || t.includes('numeric')) return 16;
  if (t.includes('double') || t.includes('float') || t.includes('real')) return 8;
  if (t.includes('timestamp') || t.includes('datetime')) return 8;
  if (t.includes('date') && !t.includes('datetime')) return 4;
  if (t.includes('char') || t.includes('varchar')) {
    const match = t.match(/\((\d+)\)/);
    return match ? Math.min(parseInt(match[1], 10), 256) : 64;
  }
  if (t.includes('text') || t.includes('json') || t.includes('clob')) return 256;
  if (t.includes('blob') || t.includes('bytea') || t.includes('binary')) return 512;
  return 32;
}

export function estimateTableRowBytes(table: TableModel): number {
  const columnBytes = table.columns.reduce((sum, col) => sum + estimateColumnBytes(col.sqlType), 0);
  return columnBytes + 24;
}

function toCamelCase(value: string): string {
  return value
    .replace(/[_\-\s]+(.)?/g, (_, char: string | undefined) => (char ? char.toUpperCase() : ''))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function clampRetentionYears(value: number): number {
  return Math.max(MIN_ARCHIVE_RETENTION_YEARS, Math.min(MAX_ARCHIVE_RETENTION_YEARS, Math.round(value)));
}

function findSourceTable(model: SqlStructuralModel | null, collection: MigrationPlan['collections'][number]): TableModel | undefined {
  return model?.tables.find((table) => table.name === collection.sourceTable);
}

function findArchiveTimeField(
  model: SqlStructuralModel | null,
  collection: MigrationPlan['collections'][number],
): string | null {
  if (collection.archive?.timeColumn) return toCamelCase(collection.archive.timeColumn);
  const source = findSourceTable(model, collection);
  const dateColumn = source?.columns.find((column) => column.bsonType === 'date');
  return dateColumn ? toCamelCase(dateColumn.name) : null;
}

function archiveMirrorNames(plan: MigrationPlan | null): Set<string> {
  return new Set(
    (plan?.collections ?? [])
      .map((collection) => collection.archive?.archiveCollection)
      .filter((name): name is string => Boolean(name)),
  );
}

function retentionYearsForCollection(
  collection: MigrationPlan['collections'][number],
  inputs: ManagerCostInputs,
  useDefaultForEligibleCollection = false,
): number {
  const explicit = inputs.collectionRetentionYears?.[collection.name];
  if (explicit !== undefined) return explicit > 0 ? clampRetentionYears(explicit) : 0;
  if (collection.archive?.retentionYears) return clampRetentionYears(collection.archive.retentionYears);
  if (useDefaultForEligibleCollection) return DEFAULT_ARCHIVE_RETENTION_YEARS;
  return 0;
}

export function buildArchiveCollectionOptions(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
  inputs: ManagerCostInputs,
): ArchiveCollectionOption[] {
  if (!model || !plan?.collections.length) return [];
  const mirrorNames = archiveMirrorNames(plan);
  return plan.collections
    .filter((collection) => !mirrorNames.has(collection.name) && !collection.bucket)
    .map((collection): ArchiveCollectionOption | null => {
      const timeField = findArchiveTimeField(model, collection);
      if (!timeField) return null;
      const retentionYears = retentionYearsForCollection(collection, inputs, true);
      return {
        collectionName: collection.name,
        sourceTable: collection.sourceTable,
        timeField,
        retentionYears: retentionYears > 0 ? retentionYears : DEFAULT_ARCHIVE_RETENTION_YEARS,
        isEnabled: retentionYears > 0,
        isPlanned: Boolean(collection.archive),
        partitionFields: collection.archive?.partitionFields ?? [timeField],
      };
    })
    .filter((option): option is ArchiveCollectionOption => option !== null);
}

function sqlRowSum(model: SqlStructuralModel): number {
  return model.tables.reduce((sum, table) => sum + (table.rowCount > 0 ? table.rowCount : 0), 0);
}

function resolveEstimatedRows(model: SqlStructuralModel | null, inputs: ManagerCostInputs): number {
  if (inputs.estimatedDataGb > 0) return Math.max(1, inputs.estimatedTotalRows);
  if (model) {
    const fromStats = sqlRowSum(model);
    if (fromStats > 0) return fromStats;
  }
  return Math.max(1, inputs.estimatedTotalRows);
}

function resolveTargetRawBytes(inputs: ManagerCostInputs): number | null {
  if (!Number.isFinite(inputs.estimatedDataGb) || inputs.estimatedDataGb <= 0) return null;
  return inputs.estimatedDataGb * BYTES_PER_GB;
}

function collectionDocumentBytes(collection: MigrationPlan['collections'][number], model: SqlStructuralModel): number {
  const tableNames =
    collection.mergedTables.length > 0 ? collection.mergedTables : [collection.sourceTable];
  let bytes = 0;
  for (const name of tableNames) {
    const table = model.tables.find((t) => t.name === name);
    if (table) bytes += estimateTableRowBytes(table);
  }
  const embedFactor = 1 + collection.embeddedArrays.length * 0.12 + collection.extendedReferences.length * 0.08;
  return Math.max(64, Math.round(bytes * embedFactor));
}

function rowsForCollection(
  collection: MigrationPlan['collections'][number],
  model: SqlStructuralModel,
  totalRows: number,
  collectionCount: number,
): number {
  const source = model.tables.find((t) => t.name === collection.sourceTable);
  const sqlSum = sqlRowSum(model);
  if (source && source.rowCount > 0 && sqlSum > 0) {
    return Math.max(1, Math.round(totalRows * (source.rowCount / sqlSum)));
  }
  return Math.max(1, Math.round(totalRows / collectionCount));
}

function averageDocumentBytes(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
): number {
  if (!model?.tables.length) return 512;
  if (plan?.collections.length) {
    const mirrors = archiveMirrorNames(plan);
    const activeCollections = plan.collections.filter((collection) => !mirrors.has(collection.name));
    const sizes = activeCollections.map((c) => collectionDocumentBytes(c, model));
    if (sizes.length === 0) return 512;
    return Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
  }
  const tableSizes = model.tables.map(estimateTableRowBytes);
  return Math.round(tableSizes.reduce((a, b) => a + b, 0) / tableSizes.length);
}

function countPlannedIndexes(plan: MigrationPlan | null, model: SqlStructuralModel | null): number {
  if (plan?.collections.length) {
    const mirrors = archiveMirrorNames(plan);
    return plan.collections.reduce((sum, c) => (mirrors.has(c.name) ? sum : sum + c.indexes.length + 1), 0);
  }
  if (!model) return 4;
  return model.tables.reduce((sum, t) => sum + t.primaryKey.length + t.foreignKeys.length + 1, 0);
}

export function selectAtlasTier(requiredRamGb: number, requiredStorageGb: number): AtlasTierSpec {
  const ram = Math.max(0.5, requiredRamGb);
  const storage = Math.max(1, requiredStorageGb);
  const match = ATLAS_CLUSTER_TIERS.find((tier) => tier.ramGb >= ram && tier.storageGb >= storage);
  return match ?? ATLAS_CLUSTER_TIERS[ATLAS_CLUSTER_TIERS.length - 1];
}

export function computeManagerCostProjection(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
  inputs: ManagerCostInputs,
): ManagerCostProjection {
  const preset = WORKLOAD_PRESETS[inputs.workloadType];
  const hasSchema = Boolean(model?.tables.length);
  const avgDocBytes = averageDocumentBytes(model, plan);
  const targetRawBytes = resolveTargetRawBytes(inputs);
  const estimatedTotalRows =
    targetRawBytes !== null ? Math.max(1, Math.round(targetRawBytes / Math.max(1, avgDocBytes))) : resolveEstimatedRows(model, inputs);

  let rawBytes = avgDocBytes * estimatedTotalRows;
  let activeRawBytes = rawBytes;
  let archiveRawBytes = 0;
  let archiveCollectionCount = 0;
  if (model && plan?.collections.length) {
    rawBytes = 0;
    activeRawBytes = 0;
    archiveRawBytes = 0;
    const mirrorNames = archiveMirrorNames(plan);
    const collectionCount = Math.max(1, plan.collections.length - mirrorNames.size);
    for (const collection of plan.collections) {
      if (mirrorNames.has(collection.name)) continue;
      const docBytes = collectionDocumentBytes(collection, model);
      const docs = rowsForCollection(collection, model, estimatedTotalRows, collectionCount);
      const collectionRawBytes = docBytes * docs;
      rawBytes += collectionRawBytes;

      const timeField = findArchiveTimeField(model, collection);
      const retentionYears = retentionYearsForCollection(collection, inputs, Boolean(timeField));
      const canArchive = !collection.bucket && retentionYears > 0 && Boolean(timeField);
      if (canArchive) {
        archiveCollectionCount += 1;
        const activeFraction = Math.min(1, retentionYears / ARCHIVE_ASSUMED_HISTORY_YEARS);
        activeRawBytes += collectionRawBytes * activeFraction;
        archiveRawBytes += collectionRawBytes * (1 - activeFraction);
      } else {
        activeRawBytes += collectionRawBytes;
      }
    }
  }

  if (targetRawBytes !== null && rawBytes > 0) {
    const scaleFactor = targetRawBytes / rawBytes;
    rawBytes *= scaleFactor;
    activeRawBytes *= scaleFactor;
    archiveRawBytes *= scaleFactor;
  }

  const indexCount = countPlannedIndexes(plan, model);
  const activeStorageBytes = activeRawBytes * BSON_OVERHEAD * (1 + indexCount * INDEX_OVERHEAD_FACTOR);
  const archiveStorageBytes = archiveRawBytes * BSON_OVERHEAD;
  const totalStorageBytes = activeStorageBytes + archiveStorageBytes;
  const activeStorageGb = activeStorageBytes / (1024 ** 3);
  const archiveStorageGb = archiveStorageBytes / (1024 ** 3);
  const totalStorageGb = activeStorageGb + archiveStorageGb;
  const rawDataGb = rawBytes / BYTES_PER_GB;

  const requiredRamGb = Math.max(2, activeStorageGb * preset.ramRatio);
  const recommendedTier = selectAtlasTier(requiredRamGb, activeStorageGb);

  const workingSetPercent = Math.min(
    100,
    Math.round(((recommendedTier.ramGb * 1024 ** 3) / Math.max(1, activeStorageBytes)) * 100),
  );

  const monthlyComputeUsd = recommendedTier.monthlyUsd;
  const monthlyBackupUsd = activeStorageGb * BACKUP_USD_PER_GB;
  const monthlyArchiveUsd = archiveStorageGb * ARCHIVE_STORAGE_USD_PER_GB;
  const monthlyTotalUsd = monthlyComputeUsd + monthlyBackupUsd + monthlyArchiveUsd;
  const baselineHotStorageBytes = rawBytes * BSON_OVERHEAD * (1 + indexCount * INDEX_OVERHEAD_FACTOR);
  const baselineHotStorageGb = baselineHotStorageBytes / BYTES_PER_GB;
  const baselineRequiredRamGb = Math.max(2, baselineHotStorageGb * preset.ramRatio);
  const baselineTier = selectAtlasTier(baselineRequiredRamGb, baselineHotStorageGb);
  const baselineMonthlyTotalUsd = baselineTier.monthlyUsd + baselineHotStorageGb * BACKUP_USD_PER_GB;
  const monthlySavingsUsd = Math.max(0, baselineMonthlyTotalUsd - monthlyTotalUsd);
  const savingsPercent =
    baselineMonthlyTotalUsd > 0 && monthlySavingsUsd > 0
      ? Math.max(0.1, Math.round((monthlySavingsUsd / baselineMonthlyTotalUsd) * 1000) / 10)
      : 0;
  const oneTimeEgressUsd = rawDataGb * EGRESS_USD_PER_GB;
  const growth = Math.max(0, inputs.growthRatePercent);
  const projectedMonthlyNextYearUsd = monthlyTotalUsd * (1 + growth / 100);
  const archiveHotDataPercent = rawBytes > 0 ? Math.round((activeRawBytes / rawBytes) * 100) : 100;

  return {
    hasSchema,
    workloadLabel: preset.label,
    readPercent: preset.readPercent,
    writePercent: preset.writePercent,
    estimatedTotalRows,
    averageDocumentBytes: avgDocBytes,
    rawDataGb,
    activeStorageGb,
    archiveStorageGb,
    totalStorageGb,
    indexCount,
    requiredRamGb,
    recommendedTier,
    workingSetPercent,
    monthlyComputeUsd,
    monthlyBackupUsd,
    monthlyArchiveUsd,
    monthlyTotalUsd,
    baselineMonthlyTotalUsd,
    monthlySavingsUsd,
    savingsPercent,
    oneTimeEgressUsd,
    growthRatePercent: growth,
    projectedMonthlyNextYearUsd,
    archiveCollectionCount,
    archiveHotDataPercent,
  };
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatRowCount(rows: number): string {
  if (rows >= 1_000_000) return `${(rows / 1_000_000).toFixed(rows % 1_000_000 === 0 ? 0 : 1)}M`;
  if (rows >= 1_000) return `${(rows / 1_000).toFixed(rows % 1_000 === 0 ? 0 : 1)}K`;
  return rows.toLocaleString();
}

export function formatGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)} TB`;
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 10) return `${gb.toFixed(1)} GB`;
  return `${gb.toFixed(2)} GB`;
}
