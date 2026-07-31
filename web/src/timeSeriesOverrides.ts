import type { TimeSeriesGranularity } from './migrationPlanTypes';
import type { SqlStructuralModel, TableModel } from './types';
import { toCamelCase } from '../../src/utilities/naming.js';

export type TimeSeriesOverride = {
  timeField: string;
  metaField?: string;
  granularity: TimeSeriesGranularity;
};

export type TimeSeriesOverrides = Record<string, TimeSeriesOverride>;

export function isActiveTimeSeriesOverride(override: TimeSeriesOverride | undefined): boolean {
  return Boolean(override?.timeField?.trim());
}

/** Drop overrides for tables that no longer exist in the model. */
export function pruneTimeSeriesOverrides(
  model: SqlStructuralModel,
  overrides: TimeSeriesOverrides,
): TimeSeriesOverrides {
  const tableNames = new Set(model.tables.map((table) => table.name));
  const pruned: TimeSeriesOverrides = {};
  for (const [tableName, override] of Object.entries(overrides)) {
    if (tableNames.has(tableName) && isActiveTimeSeriesOverride(override)) {
      pruned[tableName] = override;
    }
  }
  return pruned;
}

/** Suggest a BSON timeField from SQL column names/types. */
export function suggestTimeFieldForTable(table: TableModel): string {
  const dateColumn = table.columns.find(
    (column) =>
      /date|time|timestamp|recorded|created|updated/i.test(column.name)
      || /timestamp|datetime|date/i.test(column.sqlType),
  );
  return dateColumn ? toCamelCase(dateColumn.name) : '';
}

/** Suggest metaField from the first outgoing FK column on the table. */
export function suggestMetaFieldForTable(table: TableModel): string {
  const fk = table.foreignKeys.find((entry) => entry.referencesTable !== table.name);
  return fk ? toCamelCase(fk.column) : '';
}
