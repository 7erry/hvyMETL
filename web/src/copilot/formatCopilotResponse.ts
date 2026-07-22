/**
 * Normalizes Agent Copilot LLM output: spacing, tables, and collapsible sections
 * for long architecture responses.
 */

const NUMBERED_SECTION = /^## (\d+)\.\s+(.+)$/;

/** Ensures blank lines around headings, lists, tables, and fenced code blocks. */
export function normalizeMarkdownSpacing(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/([^\n])\n(#{1,3} )/g, '$1\n\n$2')
    .replace(/(#{1,3} [^\n]+)\n([^\n#\-|`<\s])/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Wraps numbered sections 2+ in HTML details when the model did not already use collapsibles. */
export function wrapCollapsibleSections(markdown: string): string {
  if (/<details[\s>]/i.test(markdown)) return markdown;

  const lines = markdown.split('\n');
  const output: string[] = [];
  let inCollapsible = false;
  let pendingSummary: string | null = null;
  let sectionBuffer: string[] = [];

  const flushSection = () => {
    if (!sectionBuffer.length) return;
    if (!pendingSummary) {
      output.push(...sectionBuffer);
    } else {
      output.push('<details class="copilot-details">');
      output.push(`<summary>${pendingSummary}</summary>`);
      output.push('');
      output.push(...sectionBuffer);
      output.push('');
      output.push('</details>');
    }
    sectionBuffer = [];
    pendingSummary = null;
    inCollapsible = false;
  };

  for (const line of lines) {
    const sectionMatch = line.match(NUMBERED_SECTION);
    if (sectionMatch) {
      flushSection();

      const sectionNumber = Number(sectionMatch[1]);
      const sectionTitle = sectionMatch[2].trim();

      if (sectionNumber >= 2) {
        inCollapsible = true;
        pendingSummary = `${sectionNumber}. ${sectionTitle}`;
        sectionBuffer = [];
        continue;
      }

      output.push(line);
      continue;
    }

    if (inCollapsible) {
      sectionBuffer.push(line);
    } else {
      output.push(line);
    }
  }

  flushSection();
  return output.join('\n').trim();
}

/** Formats copilot markdown for display (spacing + collapsible sections). */
export function formatCopilotResponse(content: string, options: { collapsible?: boolean } = {}): string {
  const normalized = normalizeMarkdownSpacing(content);
  if (options.collapsible === false) return normalized;
  return wrapCollapsibleSections(normalized);
}
