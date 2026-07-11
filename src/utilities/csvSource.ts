/**
 * Resolve CSV export paths for the UI pipeline (csvToAtlas import).
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, isAbsolute } from 'node:path';
import type { CollectionPlan } from '../types.js';

/** Read default CSV source directory from the environment. */
export function readCsvSourceFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.HVYMETL_CSV_SOURCE?.trim();
  return raw || undefined;
}

/** Resolve and validate a CSV file or directory path. */
export function resolveCsvSourcePath(
  requestedPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  allowedRoots?: string[],
): string {
  const candidate = (requestedPath ?? readCsvSourceFromEnv(env))?.trim();
  if (!candidate) {
    throw new Error(
      'CSV source path is required. Export tables from your source database as CSV files, set HVYMETL_CSV_SOURCE in .env, or upload CSVs in the pipeline dialog.',
    );
  }
  const resolved = resolve(candidate);
  if (!existsSync(resolved)) {
    throw new Error(`CSV source not found: ${resolved}`);
  }
  if (allowedRoots?.length) {
    const allowed = allowedRoots.some((root) => {
      try {
        const rel = relative(resolve(root), resolved);
        return !rel.startsWith('..') && !isAbsolute(rel);
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new Error('Access denied: CSV source must be inside your workspace upload directory.');
    }
  }
  return resolved;
}

/** List all CSV files under a directory, or return a single file path. */
export function listCsvFiles(root: string): string[] {
  const stat = statSync(root);
  if (stat.isFile()) {
    if (extname(root).toLowerCase() !== '.csv') {
      throw new Error(`CSV source must be a .csv file or a directory of CSV files: ${root}`);
    }
    return [root];
  }

  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.csv') files.push(full);
    }
  }
  walk(root);
  return files.sort();
}

/** Normalize a CSV basename for collection/table matching (strips .chunkN suffix). */
export function csvBaseName(filePath: string): string {
  const withoutExt = basename(filePath, extname(filePath));
  return withoutExt.replace(/\.chunk\d+$/i, '').toLowerCase();
}

/** Find CSV files that match a migration plan collection by name or source table. */
export function matchCsvFilesForCollection(allCsvFiles: string[], collection: CollectionPlan): string[] {
  const keys = new Set([collection.name.toLowerCase(), collection.sourceTable.toLowerCase()]);
  return allCsvFiles.filter((file) => keys.has(csvBaseName(file)));
}

/** Map each collection in the plan to matching CSV files under csvRoot. */
export function buildCollectionCsvMap(
  csvRoot: string,
  collections: CollectionPlan[],
): Map<string, string[]> {
  const allCsvFiles = listCsvFiles(csvRoot);
  if (allCsvFiles.length === 0) {
    throw new Error(`No CSV files found under: ${csvRoot}`);
  }

  const map = new Map<string, string[]>();
  for (const collection of collections) {
    map.set(collection.name, matchCsvFilesForCollection(allCsvFiles, collection));
  }
  return map;
}

/** True when csvRoot exists and contains at least one CSV file. */
export function hasCsvSourceAtPath(csvPath: string | undefined): boolean {
  if (!csvPath?.trim()) return false;
  const resolved = resolve(csvPath.trim());
  if (!existsSync(resolved)) return false;
  try {
    return listCsvFiles(resolved).length > 0;
  } catch {
    return false;
  }
}
