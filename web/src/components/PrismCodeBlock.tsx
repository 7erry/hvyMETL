import type { CSSProperties } from 'react';
import { highlightPrismCode, normalizePrismLanguage } from '../prismHighlight';

type PrismCodeBlockProps = {
  code: string;
  language: string;
  className?: string;
  preClassName?: string;
  style?: CSSProperties;
};

/** Read-only syntax-highlighted code block using the shared Prism grammar set. */
export function PrismCodeBlock({ code, language, className, preClassName, style }: PrismCodeBlockProps) {
  const normalized = normalizePrismLanguage(language);
  const html = highlightPrismCode(code, normalized);
  const preClasses = ['prism-code-block', preClassName, `language-${normalized}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <pre className={preClasses} style={style}>
      <code className={`language-${normalized}`} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
