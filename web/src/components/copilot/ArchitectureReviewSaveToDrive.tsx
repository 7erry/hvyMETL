import { useCallback } from 'react';
import {
  architectureReviewDocTitle,
  downloadArchitectureReviewMarkdown,
} from '../../copilot/architectureReviewHtml';
import type { MigrationPlan } from '../../migrationPlanTypes';
import { MarkdownDocumentExport } from './MarkdownDocumentExport';

type ArchitectureReviewSaveToDriveProps = {
  content: string;
  migrationPlan?: MigrationPlan | null;
};

/** Exports an architecture review to Google Docs via Drive API (replaces broken Save to Drive widget). */
export function ArchitectureReviewSaveToDrive({ content, migrationPlan = null }: ArchitectureReviewSaveToDriveProps) {
  const handleDownload = useCallback(() => {
    downloadArchitectureReviewMarkdown(content);
  }, [content]);

  return (
    <MarkdownDocumentExport
      content={content}
      docTitle={architectureReviewDocTitle(content)}
      onDownloadMarkdown={handleDownload}
      htmlOptions={{ migrationPlan }}
    />
  );
}
