import { zipSync } from 'fflate';

export type RepositoryDownloadFile = {
  relativePath: string;
  content: string;
};

/** Build a zip archive from generated repository source files. */
export function buildRepositoriesZip(files: RepositoryDownloadFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};

  for (const file of files) {
    const path = file.relativePath.trim().replace(/^\/+/, '');
    if (!path) continue;
    entries[path] = new TextEncoder().encode(file.content);
  }

  if (Object.keys(entries).length === 0) {
    throw new Error('No repository files to zip');
  }

  return zipSync(entries);
}

/** Suggested download filename for a repository language bundle. */
export function repositoriesZipFilename(language: string): string {
  const safeLanguage = language.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safeLanguage ? `hvymetl-repositories-${safeLanguage}.zip` : 'hvymetl-repositories.zip';
}

/** Trigger a single zip download containing all repository files. */
export function downloadRepositoriesZip(files: RepositoryDownloadFile[], filename: string): void {
  const zipBytes = buildRepositoriesZip(files);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
