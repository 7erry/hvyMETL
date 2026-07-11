import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTermsPageHtml } from './termsPage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('loadTermsPageHtml', () => {
  it('returns the hosted Terms and Conditions page', () => {
    const html = loadTermsPageHtml(ROOT);
    expect(html).toContain('Terms and Conditions for hvyMETL');
    expect(html).toContain('Last Updated: July 11, 2026');
    expect(html).toContain('https://hvymetl.studio');
    expect(html).toContain('https://github.com/7erry/hvyMETL');
    expect(html).toContain('NOT affiliated with');
  });
});
