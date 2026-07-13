/**
 * Shared helpers for tenant CSV uploads (pipeline and design).
 */

import multer from 'multer';
import { basename } from 'node:path';
import { listCsvFiles } from '../utilities/csvSource.js';

/** Sanitize an uploaded CSV filename for disk storage. */
export function safeCsvUploadFilename(originalname: string): string {
  const base = basename(originalname.trim()) || 'upload.csv';
  return base.replace(/[^\w.\-]+/g, '_');
}

/** Multer middleware that stores up to 500 CSV files in batchDir. */
export function createCsvUploadMiddleware(batchDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_uploadReq, _file, cb) => cb(null, batchDir),
      filename: (_uploadReq, file, cb) => cb(null, safeCsvUploadFilename(file.originalname)),
    }),
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
