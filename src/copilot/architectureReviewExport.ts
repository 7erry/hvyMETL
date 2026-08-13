/** Detects Agent Copilot architecture review markdown responses. */
export function isArchitectureReviewContent(content: string): boolean {
  const trimmed = content.trim();
  if (/^#\s+.+\s+—\s+Architecture Review/im.test(trimmed)) return true;
  // Accept hyphen/em-dash variants and reviews that start after a short preamble.
  return /^#\s+.+\s+[-–—]\s+Architecture Review/im.test(trimmed);
}

/** Extracts the review title from the leading `# … — Architecture Review` heading. */
export function architectureReviewTitle(content: string): string | null {
  const match = content.trim().match(/^#\s+(.+?)\s+[-–—]\s+Architecture Review/im);
  return match?.[1]?.trim() ?? null;
}

/** Builds a safe Drive filename for an architecture review export. */
export function architectureReviewFilename(content: string): string {
  const title = architectureReviewTitle(content);
  const base = title ? `${title} — Architecture Review` : 'Architecture Review';
  const sanitized = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${sanitized || 'Architecture Review'}.md`;
}

/** Normalizes review markdown for export (spacing without UI-only collapsible wrappers). */
export function architectureReviewExportMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/<details[^>]*>/gi, '')
    .replace(/<\/details>/gi, '')
    .replace(/<summary>([^<]*)<\/summary>/gi, '\n## $1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EXPORT_TTL_MS = 15 * 60 * 1000;
const MAX_EXPORT_BYTES = 512_000;

type ArchitectureExportEntry = {
  content: string;
  filename: string;
  expiresAt: number;
};

const exportEntries = new Map<string, ArchitectureExportEntry>();

/** Stores a short-lived architecture review export and returns its download token. */
export function createArchitectureExport(input: { content: string; filename: string }): { token: string } {
  const content = architectureReviewExportMarkdown(input.content);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes === 0) {
    throw new Error('Architecture review content is empty.');
  }
  if (bytes > MAX_EXPORT_BYTES) {
    throw new Error(`Architecture review exceeds ${MAX_EXPORT_BYTES} bytes.`);
  }

  const filename = input.filename.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!filename.toLowerCase().endsWith('.md')) {
    throw new Error('Architecture review filename must end with .md');
  }

  const token = crypto.randomUUID();
  exportEntries.set(token, {
    content,
    filename,
    expiresAt: Date.now() + EXPORT_TTL_MS,
  });
  return { token };
}

/** Reads a stored architecture review export, removing expired entries. */
export function readArchitectureExport(token: string): ArchitectureExportEntry | null {
  const entry = exportEntries.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    exportEntries.delete(token);
    return null;
  }
  return entry;
}

/** Clears all stored exports (tests only). */
export function clearArchitectureExportsForTests(): void {
  exportEntries.clear();
}

export const ARCHITECTURE_EXPORT_MAX_BYTES = MAX_EXPORT_BYTES;
