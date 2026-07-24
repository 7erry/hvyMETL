import { architectureReviewFilename } from './architectureReviewExport';

/** Verifies the staged export URL is reachable before Google Save to Drive fetches it. */
export async function validateArchitectureExportDownload(src: string): Promise<void> {
  const response = await fetch(src, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(
      detail
        ? `Architecture review export is not reachable (${response.status}): ${detail}`
        : `Architecture review export is not reachable (${response.status}).`,
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error('Architecture review export returned empty content.');
  }

  if (!body.includes('Architecture Review')) {
    throw new Error('Architecture review export did not return review content.');
  }
}

export function buildArchitectureExportSrc(downloadPath: string): string {
  return `${window.location.origin}${downloadPath}`;
}

export function buildSaveToDriveFilename(content: string, filename: string): string {
  const normalized = filename.trim() || architectureReviewFilename(content);
  return normalized.replace(/[^\x20-\x7E]+/g, '-').replace(/"/g, '') || 'Architecture-Review.md';
}
