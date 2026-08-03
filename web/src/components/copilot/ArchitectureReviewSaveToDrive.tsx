import { useCallback } from 'react';
import {
  architectureReviewDocTitle,
  downloadArchitectureReviewMarkdown,
} from '../../copilot/architectureReviewHtml';
import { MarkdownDocumentExport } from './MarkdownDocumentExport';

type ArchitectureReviewSaveToDriveProps = {
  content: string;
};

/** Exports an architecture review to Google Docs via Drive API (replaces broken Save to Drive widget). */
export function ArchitectureReviewSaveToDrive({ content }: ArchitectureReviewSaveToDriveProps) {
  const handleDownload = useCallback(() => {
    downloadArchitectureReviewMarkdown(content);
  }, [content]);

  return (
    <MarkdownDocumentExport
      content={content}
      docTitle={architectureReviewDocTitle(content)}
      onDownloadMarkdown={handleDownload}
    />
  );
}
