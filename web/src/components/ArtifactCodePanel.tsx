import { useCallback, useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { ensureShikiLanguage, highlightArtifactForEditor } from '../shikiArtifactHighlight';
import { ShikiCodeBlock } from './ShikiCodeBlock';

type ArtifactCodePanelProps = {
  value: string;
  fileName: string;
  mime: string;
  isJson?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
};

/** Map artifact file metadata to a Prism grammar id. */
export function languageForArtifact(fileName: string, mime: string, isJson?: boolean): string {
  if (isJson || fileName.endsWith('.json')) return 'json';
  if (mime === 'text/markdown' || fileName.endsWith('.md')) return 'markdown';

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const byExtension: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    py: 'python',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    cs: 'csharp',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    scala: 'scala',
    sbt: 'scala',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
  };

  return byExtension[extension] ?? 'plaintext';
}

function highlighterLanguage(language: string): string {
  if (language === 'plain' || language === 'plaintext') return 'plain';
  return language;
}

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const EDITOR_FONT_SIZE = '13px';
const EDITOR_LINE_HEIGHT = '19.5px';

function lineNumberCount(value: string): number {
  if (!value) return 1;
  return value.split('\n').length;
}

function CodeLineNumbers({ value }: { value: string }) {
  const lines = lineNumberCount(value);
  return (
    <div className="artifact-code-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index + 1} className="artifact-code-lines__row">
          {index + 1}
        </div>
      ))}
    </div>
  );
}

const editorSurfaceStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: EDITOR_FONT_SIZE,
  lineHeight: EDITOR_LINE_HEIGHT,
  minHeight: '100%',
};

/**
 * Syntax-highlighted artifact view for Migration export.
 * Read-only files use Shiki; editable tabs use Shiki when the grammar is loaded (Prism fallback until then).
 */
export function ArtifactCodePanel({
  value,
  fileName,
  mime,
  isJson,
  readOnly,
  onChange,
}: ArtifactCodePanelProps) {
  const language = languageForArtifact(fileName, mime, isJson);
  const displayLanguage = highlighterLanguage(language);
  const [shikiLangReady, setShikiLangReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShikiLangReady(false);
    void ensureShikiLanguage(displayLanguage).then(() => {
      if (!cancelled) setShikiLangReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [displayLanguage]);

  const highlight = useCallback(
    (code: string) => highlightArtifactForEditor(code, language),
    [language, shikiLangReady],
  );

  if (readOnly) {
    return (
      <div className="artifact-code-panel artifact-code-panel--readonly artifact-code-panel--with-lines" data-language={language}>
        <CodeLineNumbers value={value} />
        <div className="artifact-code-panel__body">
          <ShikiCodeBlock
            code={value}
            language={displayLanguage}
            preClassName="artifact-code-pre"
            style={{
              margin: 0,
              padding: 12,
              background: '#0d1117',
              fontSize: editorSurfaceStyle.fontSize,
              lineHeight: editorSurfaceStyle.lineHeight,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-code-panel artifact-code-panel--editable artifact-code-panel--with-lines" data-language={language}>
      <CodeLineNumbers value={value} />
      <div className="artifact-code-panel__body">
        <Editor
          key={`${language}-${shikiLangReady ? 'shiki' : 'prism'}`}
          value={value}
          onValueChange={(next) => onChange?.(next)}
          highlight={highlight}
          readOnly={false}
          tabSize={2}
          insertSpaces
          padding={12}
          className="artifact-code-editor"
          preClassName={`artifact-code-pre language-${language}`}
          textareaClassName="artifact-code-textarea"
          style={editorSurfaceStyle}
        />
      </div>
    </div>
  );
}
