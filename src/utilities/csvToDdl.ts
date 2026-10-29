/**
 * Infer CREATE TABLE DDL from CSV file contents (header + sample rows).
 */

import { parseCsv } from './csv.js';

export type CsvTextFile = {
  name: string;
  text: string;
};

function quoteIdent(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Table name from a CSV filename (customers.csv → customers). */
export function tableNameFromCsvFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.csv$/i, '').trim();
  const cleaned = base.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return 'csv_table';
  if (/^[0-9]/.test(cleaned)) return `t_${cleaned}`;
  return cleaned;
}

function inferSqlType(values: string[]): string {
  const samples = values.map((v) => v.trim()).filter((v) => v.length > 0);
  if (samples.length === 0) return 'TEXT';
  if (samples.every((v) => /^(true|false|0|1)$/i.test(v))) return 'BOOLEAN';
  if (samples.every((v) => /^-?\d+$/.test(v))) return 'INTEGER';
  if (samples.every((v) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v))) return 'DOUBLE';
  if (samples.every((v) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v))) {
    return 'TIMESTAMP';
  }
  return 'TEXT';
}

/** Build one CREATE TABLE statement from CSV text. */
export function csvTextToCreateTable(file: CsvTextFile, sampleRows = 40): string {
  const rows = parseCsv(file.text);
  if (rows.length === 0 || rows[0]!.every((cell) => cell.trim() === '')) {
    throw new Error(`CSV ${file.name} has no header row.`);
  }
  const headers = rows[0]!.map((h, i) => {
    const name = h.trim() || `column_${i + 1}`;
    return name;
  });
  const data = rows.slice(1, 1 + Math.max(1, sampleRows));
  const cols = headers.map((header, colIndex) => {
    const values = data.map((row) => row[colIndex] ?? '');
    return `  ${quoteIdent(header)} ${inferSqlType(values)}`;
  });
  const table = tableNameFromCsvFileName(file.name);
  return `CREATE TABLE ${quoteIdent(table)} (\n${cols.join(',\n')}\n);`;
}

/** Infer DDL for one or more CSV files (one table per file). */
export function csvFilesToCreateTableDdl(files: CsvTextFile[]): string {
  if (files.length === 0) {
    throw new Error('No CSV files provided.');
  }
  return files.map((file) => csvTextToCreateTable(file)).join('\n\n');
}
