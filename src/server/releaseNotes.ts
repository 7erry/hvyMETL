/** Latest release block parsed from RELEASE.md (heading + body markdown). */
export type LatestReleaseNotes = {
  heading: string;
  body: string;
};

/**
 * Returns the first `## hvyMETL x.y.z` section in RELEASE.md (newest release at top).
 */
export function parseLatestReleaseSection(markdown: string): LatestReleaseNotes | null {
  const normalized = markdown.replace(/\r\n/g, '\n').trimStart();
  const match = normalized.match(/^##\s+(hvyMETL\s+[\d.]+)\s*\n+([\s\S]*?)(?=\n---\s*\n|\n##\s+hvyMETL\s+|\s*$)/i);
  if (!match) return null;
  const heading = match[1]?.trim() ?? '';
  const body = match[2]?.trim() ?? '';
  if (!heading || !body) return null;
  return { heading, body };
}
