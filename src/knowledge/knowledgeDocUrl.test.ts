import { describe, expect, it } from 'vitest';
import {
  HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE,
  knowledgeDocGitHubUrl,
  normalizePatternKnowledgeSource,
} from './knowledgeDocUrl.js';

describe('knowledgeDocGitHubUrl', () => {
  it('maps a knowledge filename to the GitHub blob URL', () => {
    expect(knowledgeDocGitHubUrl('embed-vs-reference.md')).toBe(
      `${HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE}/embed-vs-reference.md`,
    );
  });

  it('strips knowledge/ prefix', () => {
    expect(knowledgeDocGitHubUrl('knowledge/bucket.md')).toBe(
      `${HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE}/bucket.md`,
    );
  });

  it('returns absolute URLs unchanged', () => {
    const url = `${HVYMETL_KNOWLEDGE_GITHUB_BLOB_BASE}/tree.md`;
    expect(knowledgeDocGitHubUrl(url)).toBe(url);
  });
});

describe('normalizePatternKnowledgeSource', () => {
  it('leaves non-markdown test placeholders unchanged', () => {
    expect(normalizePatternKnowledgeSource('test')).toBe('test');
  });
});
