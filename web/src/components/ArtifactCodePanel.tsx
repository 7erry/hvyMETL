import Editor from 'react-simple-code-editor';
import { highlightPrismCode } from '../prismHighlight';
import { PrismCodeBlock } from './PrismCodeBlock';

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

function highlightCode(code: string, language: string): string {
  return highlightPrismCode(code, language);
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
 * Syntax-highlighted artifact view (oneDark / Chroma-style tokens).
 * Read-only files use PrismCodeBlock; editable tabs use a transparent textarea over Prism HTML.
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

  if (readOnly) {
    return (
      <div className="artifact-code-panel artifact-code-panel--readonly artifact-code-panel--with-lines" data-language={language}>
        <CodeLineNumbers value={value} />
        <div className="artifact-code-panel__body">
          <PrismCodeBlock
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
          value={value}
          onValueChange={(next) => onChange?.(next)}
          highlight={(code) => highlightCode(code, language)}
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
