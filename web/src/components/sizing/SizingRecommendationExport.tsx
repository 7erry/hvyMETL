import { useCallback } from 'react';
import {
  downloadSizingRecommendationMarkdown,
  isSizingRecommendationContent,
  sizingRecommendationDocTitle,
} from '../../sizing/sizingRecommendationExport';
import type { SizingAssistantUiMessage } from '../../sizing/SizingAssistantContext';
import { MarkdownDocumentExport } from '../copilot/MarkdownDocumentExport';

type SizingRecommendationExportProps = {
  message: SizingAssistantUiMessage;
};

export function shouldOfferSizingRecommendationExport(message: SizingAssistantUiMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (message.toolResults?.some((item) => item.tool === 'find_optimal_cluster_tier' && item.ok)) {
    return Boolean(message.content.trim());
  }
  return Boolean(message.markdown && message.content.trim() && isSizingRecommendationContent(message.content));
}

/** Google Docs and markdown download for Atlas Sizing recommendation responses. */
export function SizingRecommendationExport({ message }: SizingRecommendationExportProps) {
  const handleDownload = useCallback(() => {
    downloadSizingRecommendationMarkdown(message.content);
  }, [message.content]);

  if (!shouldOfferSizingRecommendationExport(message)) return null;

  return (
    <MarkdownDocumentExport
      content={message.content}
      docTitle={sizingRecommendationDocTitle(message.content)}
      onDownloadMarkdown={handleDownload}
    />
  );
}
