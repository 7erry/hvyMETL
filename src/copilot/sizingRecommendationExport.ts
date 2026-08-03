import { architectureReviewExportMarkdown } from './architectureReviewExport.js';

const RECOMMENDATION_HEADING =
  /^(?:#{1,3}\s+)?(?:\*\*)?(?:recommended cluster|oplog(?:\s+(?:recommendation|sizing))?|sizing(?:\s*&\s*|\s+)capacity breakdown|cluster tier(?:\s*&\s*|\s+)topology)/im;

/** Detects Atlas sizing assistant recommendation markdown (cluster tier, oplog, capacity tables). */
export function isSizingRecommendationContent(content: string): boolean {
  const text = content.trim();
  if (text.length < 40) return false;

  if (RECOMMENDATION_HEADING.test(text)) return true;

  const signals = [
    /recommended cluster tier/i,
    /oplog recommendation/i,
    /oplog sizing/i,
    /sizing & capacity breakdown/i,
    /parameters used in the calculation/i,
    /\btop recommendation:\s*M/i,
    /shard count/i,
  ];
  const hitCount = signals.filter((pattern) => pattern.test(text)).length;
  return hitCount >= 2;
}

/** Leading markdown heading or fallback title for sizing exports. */
export function sizingRecommendationTitle(content: string): string {
  const lines = content.trim().split('\n');
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1?.[1]) return h1[1].replace(/\*\*/g, '').trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2?.[1]) return h2[1].replace(/\*\*/g, '').trim();
    const bold = line.match(/^\*\*(.+?)\*\*$/);
    if (bold?.[1]) return bold[1].trim();
  }
  return 'Atlas Sizing Recommendation';
}

/** Google Doc title for sizing recommendation export. */
export function sizingRecommendationDocTitle(content: string): string {
  const base = sizingRecommendationTitle(content);
  return base.toLowerCase().includes('sizing') ? base : `${base} — Atlas Sizing`;
}

/** Safe download filename for sizing recommendation markdown. */
export function sizingRecommendationFilename(content: string): string {
  const docTitle = sizingRecommendationDocTitle(content);
  const sanitized = docTitle.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${sanitized || 'Atlas Sizing Recommendation'}.md`;
}

/** Normalizes sizing recommendation markdown for download / Google Docs HTML conversion. */
export function sizingRecommendationExportMarkdown(content: string): string {
  return architectureReviewExportMarkdown(content);
}
