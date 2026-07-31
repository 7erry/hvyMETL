import { appendVectorSearchSectionToDesignReport } from '../../../src/copilot/copilotVectorSearchContext.ts';
import { appendAtlasSearchSectionToDesignReport } from '../../../src/copilot/copilotAtlasSearchContext.ts';
import { loadSessionVectorSearchIndexes } from './vectorSearchIndexSession';
import { loadSessionAtlasSearchIndexes } from './atlasSearchIndexSession';

/** Append Atlas search indexes created in this studio session to design-report.md. */
export function enrichDesignReportMarkdown(markdown: string): string {
  const withVector = appendVectorSearchSectionToDesignReport(
    markdown,
    loadSessionVectorSearchIndexes(),
  );
  return appendAtlasSearchSectionToDesignReport(withVector, loadSessionAtlasSearchIndexes());
}
