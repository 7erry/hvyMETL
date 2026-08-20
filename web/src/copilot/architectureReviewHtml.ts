import {
  architectureReviewDocTitle,
  architectureReviewToHtml,
} from '../../../src/copilot/architectureReviewHtml.ts';
import { architectureReviewExportMarkdown, architectureReviewFilename } from './architectureReviewExport';

export { architectureReviewDocTitle, architectureReviewToHtml };
export type { ArchitectureReviewHtmlOptions } from '../../../src/copilot/architectureReviewHtml.ts';

/** Downloads the architecture review as markdown when Google Docs export is unavailable. */
export function downloadArchitectureReviewMarkdown(content: string): void {
  const markdown = architectureReviewExportMarkdown(content);
  const filename = architectureReviewFilename(content);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
