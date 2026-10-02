import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildMajorVersionReleaseMarkdown,
  parseAllReleaseSections,
  parseLatestReleaseSection,
} from './releaseNotes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('parseLatestReleaseSection', () => {
  it('parses the top release from RELEASE.md', () => {
    const markdown = readFileSync(join(ROOT, 'RELEASE.md'), 'utf8');
    const latest = parseLatestReleaseSection(markdown);
    expect(latest).not.toBeNull();
    expect(latest?.heading).toMatch(/^hvyMETL\s+\d+\.\d+\.\d+$/i);
    expect(latest?.body.length).toBeGreaterThan(20);
  });

  it('parses all release sections in order', () => {
    const markdown = readFileSync(join(ROOT, 'RELEASE.md'), 'utf8');
    const sections = parseAllReleaseSections(markdown);
    expect(sections.length).toBeGreaterThan(5);
    expect(sections[0]?.heading).toMatch(/^hvyMETL\s+5\.1\./);
  });

  it('builds a major-version summary for v5', () => {
    const markdown = readFileSync(join(ROOT, 'RELEASE.md'), 'utf8');
    const summary = buildMajorVersionReleaseMarkdown(markdown, 5);
    expect(summary).not.toBeNull();
    expect(summary).toContain('### 5.1.35');
    expect(summary).toContain('### 5.0.0');
    expect(summary).toContain('5.x');
  });

  it('stops at section divider', () => {
    const sample = `## hvyMETL 1.0.0

**Feature** — First release.

---

## hvyMETL 0.9.0

Older.
`;
    expect(parseLatestReleaseSection(sample)).toEqual({
      heading: 'hvyMETL 1.0.0',
      body: '**Feature** — First release.',
    });
  });
});
