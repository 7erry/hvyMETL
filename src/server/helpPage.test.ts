import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHelpPageHtml } from './helpPage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('loadHelpPageHtml', () => {
  it('links the GitHub README and embeds each tutorial video', () => {
    const html = loadHelpPageHtml(ROOT);
    expect(html).toContain('https://github.com/7erry/hvyMETL/blob/main/README.md');
    const files = [
      '06-accessed-together.mp4',
      '01-erwin-full-migration.mp4',
      '02-creator.mp4',
      '03-shell.mp4',
      '04-aggregate.mp4',
      '05-query.mp4',
    ];
    let previous = -1;
    for (const file of files) {
      const url = `https://raw.githubusercontent.com/7erry/hvyMETL/main/docs/tutorials/${file}`;
      const at = html.indexOf(`<video controls playsinline preload="metadata" src="${url}">`);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
    expect(html).not.toContain('github.com/7erry/hvyMETL/blob/main/docs/tutorials');
  });
});
