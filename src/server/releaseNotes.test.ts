import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLatestReleaseSection } from './releaseNotes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('parseLatestReleaseSection', () => {
  it('parses the top release from RELEASE.md', () => {
    const markdown = readFileSync(join(ROOT, 'RELEASE.md'), 'utf8');
    const latest = parseLatestReleaseSection(markdown);
    expect(latest).not.toBeNull();
    expect(latest?.heading).toMatch(/^hvyMETL\s+\d+\.\d+\.\d+$/i);
    expect(latest?.body.length).toBeGreaterThan(20);
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
