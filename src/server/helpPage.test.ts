import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHelpPageHtml } from './helpPage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('loadHelpPageHtml', () => {
  it('links the GitHub README and each tutorial video', () => {
    const html = loadHelpPageHtml(ROOT);
    expect(html).toContain('https://github.com/7erry/hvyMETL/blob/main/README.md');
    expect(html).toContain('docs/tutorials/01-erwin-full-migration.mp4');
    expect(html).toContain('docs/tutorials/02-creator.mp4');
    expect(html).toContain('docs/tutorials/03-shell.mp4');
    expect(html).toContain('docs/tutorials/04-aggregate.mp4');
    expect(html).toContain('docs/tutorials/05-query.mp4');
  });
});
