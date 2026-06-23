import Editor from 'react-simple-code-editor';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { highlight, languages } from '../prismSetup';

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
  if (language === 'plain' || language === 'plaintext') return 'text';
  return language;
}

type PrismGrammar = typeof languages.json;

function grammarForLanguage(language: string): { grammar: PrismGrammar; id: string } | null {
  switch (language) {
    case 'json':
      return { grammar: languages.json, id: 'json' };
    case 'markdown':
      return { grammar: languages.markdown, id: 'markdown' };
    case 'yaml':
      return { grammar: languages.yaml, id: 'yaml' };
    case 'typescript':
      return { grammar: languages.typescript, id: 'typescript' };
    case 'javascript':
      return { grammar: languages.javascript, id: 'javascript' };
    case 'python':
      return { grammar: languages.python, id: 'python' };
    case 'go':
      return { grammar: languages.go, id: 'go' };
    case 'java':
      return { grammar: languages.java, id: 'java' };
    case 'kotlin':
      return { grammar: languages.kotlin, id: 'kotlin' };
    case 'csharp':
      return { grammar: languages.csharp, id: 'csharp' };
    case 'rust':
      return { grammar: languages.rust, id: 'rust' };
    case 'ruby':
      return { grammar: languages.ruby, id: 'ruby' };
    case 'php':
      return { grammar: languages.php, id: 'php' };
    case 'swift':
      return { grammar: languages.swift, id: 'swift' };
    case 'c':
      return { grammar: languages.c, id: 'c' };
    case 'cpp':
      return { grammar: languages.cpp, id: 'cpp' };
    case 'scala':
      return { grammar: languages.scala, id: 'scala' };
    default:
      return null;
  }
}

function highlightCode(code: string, language: string): string {
  const grammar = grammarForLanguage(language);
  if (!grammar) return code;
  try {
    return highlight(code, grammar.grammar, grammar.id);
  } catch {
    return code;
  }
}

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const EDITOR_FONT_SIZE = '13px';
const EDITOR_LINE_HEIGHT = '19.5px';

const editorSurfaceStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: EDITOR_FONT_SIZE,
  lineHeight: EDITOR_LINE_HEIGHT,
  minHeight: '100%',
};

const highlighterStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    margin: 0,
    padding: 12,
    background: '#0d1117',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'none',
    fontFamily: editorSurfaceStyle.fontFamily,
    fontSize: editorSurfaceStyle.fontSize,
    lineHeight: editorSurfaceStyle.lineHeight,
  },
};

/**
 * Syntax-highlighted artifact view (oneDark / Chroma-style tokens).
 * Read-only files use react-syntax-highlighter; editable tabs use a transparent textarea over Prism HTML.
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
      <div className="artifact-code-panel artifact-code-panel--readonly" data-language={language}>
        <SyntaxHighlighter
          language={displayLanguage}
          style={highlighterStyle}
          customStyle={{
            margin: 0,
            padding: 12,
            background: '#0d1117',
            fontSize: editorSurfaceStyle.fontSize,
            lineHeight: editorSurfaceStyle.lineHeight,
          }}
          showLineNumbers={false}
          wrapLongLines
          PreTag="div"
        >
          {value}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <div className="artifact-code-panel artifact-code-panel--editable" data-language={language}>
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
  );
}
