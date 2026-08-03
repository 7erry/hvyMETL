export {
  isSizingRecommendationContent,
  sizingRecommendationDocTitle,
  sizingRecommendationExportMarkdown,
  sizingRecommendationFilename,
  sizingRecommendationTitle,
} from '../../../src/copilot/sizingRecommendationExport.ts';

import { sizingRecommendationExportMarkdown, sizingRecommendationFilename } from '../../../src/copilot/sizingRecommendationExport.ts';

/** Downloads a sizing recommendation as markdown. */
export function downloadSizingRecommendationMarkdown(content: string): void {
  const markdown = sizingRecommendationExportMarkdown(content);
  const filename = sizingRecommendationFilename(content);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
