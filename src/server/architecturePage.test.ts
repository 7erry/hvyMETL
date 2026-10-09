import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArchitecturePageHtml } from './architecturePage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('loadArchitecturePageHtml', () => {
  it('returns the hosted architecture diagram', () => {
    const html = loadArchitecturePageHtml(ROOT);
    expect(html).toContain('<title>hvyMETL Diagram</title>');
    expect(html).toContain('archify 3.0.1');
  });
});
