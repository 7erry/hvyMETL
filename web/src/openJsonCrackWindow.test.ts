import { describe, expect, it } from 'vitest';
import { buildJsonCrackViewerDocument, JSON_CRACK_WIDGET_URL } from './openJsonCrackWindow';

describe('buildJsonCrackViewerDocument', () => {
  it('embeds JSON Crack widget and passes JSON via postMessage bootstrap', () => {
    const html = buildJsonCrackViewerDocument('orders · JSON Crack', '{\n  "name": "orders"\n}');
    expect(html).toContain(JSON_CRACK_WIDGET_URL);
    expect(html).toContain('json-crack-embed');
    expect(html).toContain('\\"name\\": \\"orders\\"');
    expect(html).toContain('theme: \'dark\'');
  });

  it('escapes HTML in the document title', () => {
    const html = buildJsonCrackViewerDocument('<script>alert(1)</script>', '{}');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script></title>');
  });
});
