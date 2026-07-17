import { formatCsvRow, parseCsv } from '../../src/utilities/csv.ts';

/** Stay under common 1MB reverse-proxy limits (nginx default). */
export const CSV_UPLOAD_CHUNK_BYTES = 900 * 1024;

function chunkFileName(originalName: string, chunkIndex: number): string {
  const base = originalName.replace(/\.csv$/i, '');
  return `${base}.chunk${chunkIndex}.csv`;
}

function rowsToCsvBlob(rows: string[][]): Blob {
  const text = rows.map((row) => formatCsvRow(row)).join('\n') + '\n';
  return new Blob([text], { type: 'text/csv' });
}

/** Split one large CSV into `.chunkN.csv` parts that each fit under maxChunkBytes. */
export async function splitCsvFileForUpload(
  file: File,
  maxChunkBytes = CSV_UPLOAD_CHUNK_BYTES,
): Promise<File[]> {
  if (file.size <= maxChunkBytes) return [file];

  const rows = parseCsv(await file.text());
  if (rows.length <= 1) return [file];

  const header = rows[0];
  const headerBlob = rowsToCsvBlob([header]);
  const chunks: File[] = [];
  let chunkRows: string[][] = [header];
  let chunkBytes = headerBlob.size;
  let chunkIndex = 1;

  for (const row of rows.slice(1)) {
    const rowBlob = rowsToCsvBlob([row]);
    if (chunkRows.length > 1 && chunkBytes + rowBlob.size > maxChunkBytes) {
      chunks.push(new File([rowsToCsvBlob(chunkRows)], chunkFileName(file.name, chunkIndex), { type: 'text/csv' }));
      chunkIndex += 1;
      chunkRows = [header];
      chunkBytes = headerBlob.size;
    }
    chunkRows.push(row);
    chunkBytes += rowBlob.size;
  }

  if (chunkRows.length > 1) {
    chunks.push(new File([rowsToCsvBlob(chunkRows)], chunkFileName(file.name, chunkIndex), { type: 'text/csv' }));
  }

  return chunks.length > 0 ? chunks : [file];
}

/** Expand any oversized CSV picks into chunk files before upload. */
export async function prepareCsvFilesForUpload(
  files: File[],
  maxChunkBytes = CSV_UPLOAD_CHUNK_BYTES,
): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) {
    prepared.push(...(await splitCsvFileForUpload(file, maxChunkBytes)));
  }
  return prepared;
}
