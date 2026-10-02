import { describe, expect, it } from 'vitest';
import {
  highlightArtifactCodeToHtml,
  normalizeShikiLanguage,
  shikiHtmlToEditorMarkup,
} from './shikiArtifactHighlight';

describe('normalizeShikiLanguage', () => {
  it('maps common aliases', () => {
    expect(normalizeShikiLanguage('ts')).toBe('typescript');
    expect(normalizeShikiLanguage('md')).toBe('markdown');
  });
});

describe('highlightArtifactCodeToHtml', () => {
  it('highlights JSON for migration plan tabs', async () => {
    const html = await highlightArtifactCodeToHtml('{\n  "profileId": "catalog"\n}', 'json');
    expect(html).toMatch(/shiki/i);
    expect(html).toContain('profileId');
  });

  it('highlights markdown design reports', async () => {
    const html = await highlightArtifactCodeToHtml('# Design report\n\n- item', 'markdown');
    expect(html).toMatch(/shiki/i);
  });
});

describe('shikiHtmlToEditorMarkup', () => {
  it('extracts inner code markup for the editor overlay', () => {
    const inner = shikiHtmlToEditorMarkup('<pre class="shiki"><code><span>x</span></code></pre>');
    expect(inner).toContain('<span>x</span>');
  });
});
