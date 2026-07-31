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

export type TimeSeriesFieldOption = {
  /** BSON field name sent to createCollection timeseries. */
  bsonField: string;
  /** Original SQL column name for display. */
  columnName: string;
  sqlType: string;
};

/** Every table column as a selectable BSON field (camelCase). */
export function columnFieldOptionsForTable(table: TableModel): TimeSeriesFieldOption[] {
  return table.columns.map((column) => ({
    bsonField: toCamelCase(column.name),
    columnName: column.name,
    sqlType: column.sqlType,
  }));
}

function isDateLikeColumn(option: TimeSeriesFieldOption): boolean {
  return (
    /date|time|timestamp|recorded|created|updated/i.test(option.columnName)
    || /timestamp|datetime|date/i.test(option.sqlType)
  );
}

/** Columns suitable for timeseries.timeField (date/timestamp first, else all non-PK columns). */
export function timeFieldOptionsForTable(table: TableModel): TimeSeriesFieldOption[] {
  const options = columnFieldOptionsForTable(table);
  const dateLike = options.filter(isDateLikeColumn);
  if (dateLike.length > 0) return dateLike;
  return options.filter((option) => {
    const column = table.columns.find((entry) => entry.name === option.columnName);
    return column ? !column.isPrimaryKey : true;
  });
}

/** Columns suitable for optional timeseries.metaField (all columns except the chosen time field). */
export function metaFieldOptionsForTable(table: TableModel, timeFieldBson: string): TimeSeriesFieldOption[] {
  const normalizedTime = timeFieldBson.trim();
  return columnFieldOptionsForTable(table).filter((option) => option.bsonField !== normalizedTime);
}

function mergeSelectedFieldOption(
  options: TimeSeriesFieldOption[],
  selectedBson: string,
  table: TableModel,
): TimeSeriesFieldOption[] {
  const trimmed = selectedBson.trim();
  if (!trimmed || options.some((option) => option.bsonField === trimmed)) {
    return options;
  }
  const column = table.columns.find((entry) => toCamelCase(entry.name) === trimmed);
  return [
    ...options,
    {
      bsonField: trimmed,
      columnName: column?.name ?? trimmed,
      sqlType: column?.sqlType ?? 'unknown',
    },
  ];
}

export function timeFieldSelectOptions(table: TableModel, selectedBson: string): TimeSeriesFieldOption[] {
  return mergeSelectedFieldOption(timeFieldOptionsForTable(table), selectedBson, table);
}

export function metaFieldSelectOptions(table: TableModel, timeFieldBson: string, selectedMeta: string): TimeSeriesFieldOption[] {
  return mergeSelectedFieldOption(metaFieldOptionsForTable(table, timeFieldBson), selectedMeta, table);
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
