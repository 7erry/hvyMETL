/**
 * Shared helpers for tenant CSV uploads (pipeline and design).
 */

import multer from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { listCsvFiles } from '../utilities/csvSource.js';
import { assertPathWithinRoot, tenantCsvBatchDir, tenantUploadRoot } from './tenant.js';

/** Max bytes per CSV file on the API server (override with HVYMETL_CSV_MAX_FILE_MB). */
export function csvUploadMaxFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  const mb = Number(env.HVYMETL_CSV_MAX_FILE_MB ?? '500');
  if (!Number.isFinite(mb) || mb <= 0) return 500 * 1024 * 1024;
  return mb * 1024 * 1024;
}

/** Resolve a new or existing tenant CSV batch directory for staged uploads. */
export function resolveCsvUploadBatchDir(
  rootDir: string,
  tenantId: string,
  appendToPath?: string,
): string {
  const trimmed = appendToPath?.trim();
  if (!trimmed) {
    return tenantCsvBatchDir(rootDir, tenantId, 'csv-batch');
  }
  const resolved = resolve(trimmed);
  const csvRoot = join(tenantUploadRoot(rootDir, tenantId), 'csv');
  assertPathWithinRoot(csvRoot, resolved);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/** Sanitize an uploaded CSV filename for disk storage. */
export function safeCsvUploadFilename(originalname: string): string {
  const base = basename(originalname.trim()) || 'upload.csv';
  return base.replace(/[^\w.\-]+/g, '_');
}

/** Map multer errors to HTTP status + JSON error payloads. */
export function formatMulterUploadError(error: unknown): { status: number; error: string; hint?: string } {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        error: 'CSV file exceeds the server upload size limit.',
        hint: 'Split large exports, or set HVYMETL_CSV_MAX_FILE_MB on the API server.',
      };
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return { status: 400, error: 'Too many CSV files in one upload request.' };
    }
  }
  return { status: 400, error: String(error) };
}

/** Multer middleware that stores up to 500 CSV files in batchDir. */
export function createCsvUploadMiddleware(batchDir: string, maxFileBytes = csvUploadMaxFileBytes()) {
  return multer({
    storage: multer.diskStorage({
      destination: (_uploadReq, _file, cb) => cb(null, batchDir),
      filename: (_uploadReq, file, cb) => cb(null, safeCsvUploadFilename(file.originalname)),
    }),
    limits: {
      fileSize: maxFileBytes,
      files: 500,
    },
  }).array('csvs', 500);
}

export type CsvUploadResponse = {
  ok: true;
  csvSourcePath: string;
  fileCount: number;
  files: string[];
};

/** Build the API response after CSV files are saved to batchDir. */
export function buildCsvUploadResponse(batchDir: string): CsvUploadResponse {
  const files = listCsvFiles(batchDir).map((filePath) => basename(filePath));
  return {
    ok: true,
    csvSourcePath: batchDir,
    fileCount: files.length,
    files,
  };
}
