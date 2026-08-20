import { architectureReviewExportMarkdown, architectureReviewTitle } from './architectureReviewExport.js';
import {
  architectureReviewCollectionDiagramsHtml,
  ARCHITECTURE_REVIEW_COLLECTION_DIAGRAM_STYLES,
} from './architectureReviewCollectionDiagram.js';
import type { MigrationPlan } from '../types.js';

export type ArchitectureReviewHtmlOptions = {
  migrationPlan?: MigrationPlan | null;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineNoLinks(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function inlineMarkdown(text: string): string {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(formatInlineNoLinks(text.slice(lastIndex, match.index)));
    }
    parts.push(
      `<a href="${escapeHtml(match[2]!)}">${formatInlineNoLinks(match[1]!)}</a>`,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(formatInlineNoLinks(text.slice(lastIndex)));
  }

  return parts.join('');
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/** Converts an architecture review markdown response into HTML for Google Docs import. */
export function architectureReviewToHtml(markdown: string, options: ArchitectureReviewHtmlOptions = {}): string {
  const normalized = architectureReviewExportMarkdown(markdown);
  const title = architectureReviewTitle(markdown) ?? 'Architecture Review';
  const lines = normalized.split('\n');
  const bodyParts: string[] = [];
  const collectionDiagramsHtml = options.migrationPlan
    ? architectureReviewCollectionDiagramsHtml(options.migrationPlan)
    : '';
  let collectionDiagramsInserted = false;

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      bodyParts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
      const header = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index]?.includes('|')) {
        rows.push(splitTableRow(lines[index] ?? ''));
        index += 1;
      }
      const thead = `<tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr>`;
      const tbody = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`)
        .join('');
      bodyParts.push(`<table border="1" cellpadding="6" cellspacing="0"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
      continue;
    }

    if (line.startsWith('### ')) {
      bodyParts.push(`<h3>${inlineMarkdown(line.slice(4).trim())}</h3>`);
      index += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      bodyParts.push(`<h2>${inlineMarkdown(line.slice(3).trim())}</h2>`);
      index += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      bodyParts.push(`<h1>${inlineMarkdown(line.slice(2).trim())}</h1>`);
      if (collectionDiagramsHtml && !collectionDiagramsInserted) {
        bodyParts.push(collectionDiagramsHtml);
        collectionDiagramsInserted = true;
      }
      index += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      bodyParts.push(`<blockquote>${inlineMarkdown(line.slice(2).trim())}</blockquote>`);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[index] ?? '').replace(/^[-*]\s+/, '').trim())}</li>`);
        index += 1;
      }
      bodyParts.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    bodyParts.push(`<p>${inlineMarkdown(line.trim())}</p>`);
    index += 1;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — Architecture Review</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.45; color: #111; }
    table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
    th { background: #f5f5f5; text-align: left; }
    pre { background: #f6f8fa; padding: 12px; overflow-x: auto; border-radius: 6px; }
    code { font-family: Menlo, Consolas, monospace; font-size: 0.92em; }
    a { color: #00684a; text-decoration: underline; }
    a:visited { color: #004d38; }
    ${ARCHITECTURE_REVIEW_COLLECTION_DIAGRAM_STYLES}
  </style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;
}

/** Document title used when creating a Google Doc from an architecture review. */
export function architectureReviewDocTitle(markdown: string): string {
  const title = architectureReviewTitle(markdown);
  return title ? `${title} — Architecture Review` : 'Architecture Review';
}
