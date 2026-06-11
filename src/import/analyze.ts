/**
 * CSV analysis: the read-only first step of the csvToAtlas workflow.
 *
 * Given one or more CSV files, this module reports their headers and row
 * counts, ranks the fields the files share (join candidates), and suggests
 * a join field plus a safe collection name — all without touching Atlas.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseCsv } from '../utilities/csv.js';

/** Parsed contents of one CSV file. */
export type ParsedCsvFile = {
  /** Path the file was read from. */
  path: string;
  /** Header row (column names). */
  headers: string[];
  /** Data rows (each a string-cell array parallel to headers). */
  rows: string[][];
};

/** Analysis result matching the csvToAtlas skill's documented JSON shape. */
export type CsvAnalysis = {
  files: { path: string; headers: string[]; rowCount: number }[];
  commonFields: { field: string; presentInFiles: number; looksLikeId: boolean }[];
  suggestedJoinField: string | null;
  suggestedCollectionName: string;
  /** True when every file shares an identical header set (chunked partitions). */
  arePartitions: boolean;
};

/** Read and parse one CSV file into headers and rows. */
export function readCsvFile(path: string): ParsedCsvFile {
  const allRows = parseCsv(readFileSync(path, 'utf8'));
  if (allRows.length === 0) return { path, headers: [], rows: [] };
  const [headers, ...rows] = allRows;
  return { path, headers, rows };
}

/** Does a field name look like a join/identifier key? */
function looksLikeIdField(field: string): boolean {
  return /(^_?id$|Id$|_id$)/.test(field);
}

/** Turn a file name into a safe MongoDB collection name. */
function safeCollectionName(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, '')
    .replace(/\.chunk\d+$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/** Strip the ".chunkN" partition suffix from a base file name. */
function stripChunkSuffix(fileName: string): string {
  return fileName.replace(/\.chunk\d+(?=\.csv$)/i, '');
}

/** Analyze a set of parsed CSV files. */
export function analyzeCsvFiles(files: ParsedCsvFile[]): CsvAnalysis {
  // Count in how many files each field appears.
  const fieldPresence = new Map<string, number>();
  for (const file of files) {
    for (const header of new Set(file.headers)) {
      fieldPresence.set(header, (fieldPresence.get(header) ?? 0) + 1);
    }
  }

  // Common fields appear in at least two files (or all fields, single file).
  const commonFields = [...fieldPresence.entries()]
    .filter(([, count]) => (files.length > 1 ? count > 1 : true))
    .map(([field, count]) => ({ field, presentInFiles: count, looksLikeId: looksLikeIdField(field) }))
    .sort((a, b) => {
      // Rank: id-looking fields first, then by how many files share them.
      if (a.looksLikeId !== b.looksLikeId) return a.looksLikeId ? -1 : 1;
      return b.presentInFiles - a.presentInFiles;
    });

  // Partition detection: identical header signatures mean chunk files of one
  // dataset (what the parallel ETL produces), not relational CSVs to join.
  const headerSignatures = new Set(files.map((file) => file.headers.join('\u0000')));
  const arePartitions = files.length > 1 && headerSignatures.size === 1;

  const suggestedJoinField = arePartitions
    ? (files[0].headers.includes('_id') ? '_id' : null)
    : (commonFields.find((candidate) => candidate.looksLikeId)?.field ?? commonFields[0]?.field ?? null);

  // Collection name: shared base name for partitions, first file otherwise,
  // falling back to the join field.
  const baseNames = [...new Set(files.map((file) => stripChunkSuffix(basename(file.path))))];
  const suggestedCollectionName =
    baseNames.length === 1
      ? safeCollectionName(baseNames[0])
      : safeCollectionName(suggestedJoinField ? suggestedJoinField.replace(/_?id$/i, '') || baseNames[0] : baseNames[0]);

  return {
    files: files.map((file) => ({ path: file.path, headers: file.headers, rowCount: file.rows.length })),
    commonFields,
    suggestedJoinField,
    suggestedCollectionName,
    arePartitions,
  };
}
