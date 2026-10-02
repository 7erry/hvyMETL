/** GitHub blob base for hvyMETL knowledge-base markdown files. */
export const HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE =
  'https://github.com/7erry/hvyMETL/blob/main/knowledge';

/**
 * Build a GitHub URL for a knowledge doc filename (e.g. `embed-vs-reference.md`).
 * Already-absolute URLs are returned unchanged.
 */
export function knowledgeDocGitHubUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const fileName = trimmed.replace(/^knowledge\//, '').split('/').pop() ?? trimmed;
  return `${HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE}/${fileName}`;
}

/**
 * Normalize pattern `knowledgeSource` values for migration plans and UI export.
 * Maps `*.md` filenames to GitHub blob URLs; leaves non-markdown placeholders unchanged.
 */
export function normalizePatternKnowledgeSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.endsWith('.md') || trimmed.startsWith('knowledge/')) {
    return knowledgeDocGitHubUrl(trimmed);
  }
  return trimmed;
}
