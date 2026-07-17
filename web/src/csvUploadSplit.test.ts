import { describe, expect, it } from 'vitest';
import { formatCsvRow } from '../../src/utilities/csv.ts';
import { CSV_UPLOAD_CHUNK_BYTES, prepareCsvFilesForUpload, splitCsvFileForUpload } from './csvUploadSplit';

function csvFile(name: string, rows: string[][]): File {
  const text = rows.map((row) => formatCsvRow(row)).join('\n') + '\n';
  return new File([text], name, { type: 'text/csv' });
}

describe('csvUploadSplit', () => {
  it('returns the original file when it is under the chunk size limit', async () => {
    const file = csvFile('clusters.csv', [
      ['Name', 'ARR'],
      ['prod', '$1.00'],
    ]);
    const parts = await splitCsvFileForUpload(file, CSV_UPLOAD_CHUNK_BYTES);
    expect(parts).toHaveLength(1);
    expect(parts[0].name).toBe('clusters.csv');
  });

  it('splits oversized CSVs into .chunkN.csv files with a header in each part', async () => {
    const rows: string[][] = [['Name', 'ARR']];
    for (let index = 0; index < 400; index += 1) {
      rows.push([`cluster-${index}`, `"$${index},000.00"`]);
    }
    const file = csvFile('clusters.csv', rows);
    const maxChunkBytes = 4 * 1024;
    expect(file.size).toBeGreaterThan(maxChunkBytes);

    const parts = await splitCsvFileForUpload(file, maxChunkBytes);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].name).toBe('clusters.chunk1.csv');
    expect(parts.every((part) => part.size <= maxChunkBytes)).toBe(true);
  });

  it('prepareCsvFilesForUpload expands only files that exceed the limit', async () => {
    const small = csvFile('metrics.csv', [['Name'], ['a']]);
    const largeRows: string[][] = [['Name', 'ARR']];
    for (let index = 0; index < 400; index += 1) {
      largeRows.push([`cluster-${index}`, `"$${index},000.00"`]);
    }
    const large = csvFile('clusters.csv', largeRows);
    const maxChunkBytes = 4 * 1024;

    const prepared = await prepareCsvFilesForUpload([small, large], maxChunkBytes);
    expect(prepared.some((file) => file.name === 'metrics.csv')).toBe(true);
    expect(prepared.some((file) => file.name.startsWith('clusters.chunk'))).toBe(true);
  });
});
