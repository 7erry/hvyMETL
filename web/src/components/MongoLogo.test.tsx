import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MongoLogo } from './MongoLogo';

describe('MongoLogo architecture link', () => {
  it('opens the hosted diagram in dark mode', () => {
    const html = renderToStaticMarkup(createElement(MongoLogo));
    expect(html).toContain('aria-label="Architecture diagram"');
    expect(html).toContain('href="/architecture?theme=dark"');
    expect(html).toContain('src="/studio-architecture-icon.png"');
  });
});
