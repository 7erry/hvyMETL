import { appendVectorSearchSectionToDesignReport } from '../../src/copilot/copilotVectorSearchContext.ts';
import { loadSessionVectorSearchIndexes } from './vectorSearchIndexSession';

/** Append Atlas vector search indexes created in this studio session to design-report.md. */
export function enrichDesignReportMarkdown(markdown: string): string {
  return appendVectorSearchSectionToDesignReport(markdown, loadSessionVectorSearchIndexes());
}
