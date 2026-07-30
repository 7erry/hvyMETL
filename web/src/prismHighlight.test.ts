import { describe, expect, it } from 'vitest';
import { highlightPrismCode } from './prismHighlight';

describe('highlightPrismCode', () => {
  it('emits Prism token spans for TypeScript (regression: PHP hook without markup-templating)', () => {
    const html = highlightPrismCode('export const n = 1;', 'typescript');
    expect(html).toContain('class="token');
    expect(html).toContain('keyword');
  });

  it('emits token spans for generated PHP sources', () => {
    const html = highlightPrismCode('<?php echo $x;', 'php');
    expect(html).toContain('class="token');
  });
});
