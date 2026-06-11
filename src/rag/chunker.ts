/**
 * Knowledge-base loading and chunking.
 *
 * RAG retrieval works on small, focused pieces of text rather than whole
 * documents. This module reads every markdown file in the knowledge/ folder
 * and splits each one at its "##" headings, so a single chunk covers one
 * idea (for example "Bucket Pattern > Applicability rules").
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { KnowledgeChunk } from '../types.js';

/**
 * Split one markdown document into heading-scoped chunks.
 *
 * The document title (the single "#" heading) is prepended to every chunk's
 * heading path so a chunk always carries its pattern name for scoring.
 *
 * @param sourceFile - File name used to attribute the chunk, e.g. "bucket.md".
 * @param markdown - The full markdown text of the document.
 */
export function chunkMarkdown(sourceFile: string, markdown: string): KnowledgeChunk[] {
  const lines = markdown.split('\n');
  const chunks: KnowledgeChunk[] = [];

  let documentTitle = '';
  let currentHeading = '';
  let currentLines: string[] = [];

  /** Push the accumulated section as a chunk if it has any content. */
  function flushSection(): void {
    const text = currentLines.join('\n').trim();
    if (text.length === 0) return;
    const heading = currentHeading ? `${documentTitle} > ${currentHeading}` : documentTitle;
    chunks.push({ sourceFile, heading, text });
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      documentTitle = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ')) {
      flushSection();
      currentHeading = line.slice(3).trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flushSection();

  return chunks;
}

/**
 * Load and chunk every markdown file in a knowledge folder.
 *
 * @param knowledgeDir - Absolute or relative path to the knowledge/ folder.
 */
export function loadKnowledgeBase(knowledgeDir: string): KnowledgeChunk[] {
  const markdownFiles = readdirSync(knowledgeDir).filter((file) => file.endsWith('.md'));
  return markdownFiles.flatMap((file) =>
    chunkMarkdown(file, readFileSync(join(knowledgeDir, file), 'utf8')),
  );
}
