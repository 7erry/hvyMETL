import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildRepositoriesZip,
  repositoriesZipFilename,
  type RepositoryDownloadFile,
} from './repositoryDownload';

const SAMPLE_FILES: RepositoryDownloadFile[] = [
  { relativePath: 'mongoClient.ts', content: 'export const db = null;\n' },
  { relativePath: 'repositories/productsRepository.ts', content: 'export function findProducts() {}\n' },
];

describe('repositoryDownload', () => {
  it('builds a zip containing every repository file by relative path', () => {
    const zipBytes = buildRepositoriesZip(SAMPLE_FILES);
    expect(zipBytes.length).toBeGreaterThan(22);
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);

    const extracted = unzipSync(zipBytes);
    expect(Object.keys(extracted).sort()).toEqual([
      'mongoClient.ts',
      'repositories/productsRepository.ts',
    ]);
    expect(new TextDecoder().decode(extracted['mongoClient.ts'])).toBe('export const db = null;\n');
  });

  it('throws when no files are provided', () => {
    expect(() => buildRepositoriesZip([])).toThrow(/No repository files/);
  });

  it('builds a language-specific zip filename', () => {
    expect(repositoriesZipFilename('node')).toBe('hvymetl-repositories-node.zip');
    expect(repositoriesZipFilename('java')).toBe('hvymetl-repositories-java.zip');
  });
});
