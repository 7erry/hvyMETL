import { useEffect, useState, type CSSProperties } from 'react';
import { highlightArtifactCodeToHtml } from '../shikiArtifactHighlight';

type ShikiCodeBlockProps = {
  code: string;
  language: string;
  className?: string;
  preClassName?: string;
  style?: CSSProperties;
};

/** Read-only Shiki-highlighted block for migration export and artifacts. */
export function ShikiCodeBlock({ code, language, className, preClassName, style }: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    void highlightArtifactCodeToHtml(code, language).then((marked) => {
      if (!cancelled) setHtml(marked);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html === null) {
    return (
      <pre
        className={[preClassName, 'artifact-code-pre', 'artifact-shiki-fallback', className].filter(Boolean).join(' ')}
        style={style}
      >
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={['artifact-shiki-block', preClassName, className].filter(Boolean).join(' ')}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
