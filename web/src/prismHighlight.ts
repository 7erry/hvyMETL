import { highlight, languages } from './prismSetup';

type PrismGrammar = typeof languages.json;

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  plaintext: 'plain',
  text: 'plain',
};

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
    case 'sql':
      return { grammar: languages.sql, id: 'sql' };
    case 'bash':
      return { grammar: languages.bash, id: 'bash' };
    default:
      return null;
  }
}

/** Map markdown / file extension language ids to Prism grammar ids. */
export function normalizePrismLanguage(language: string): string {
  const trimmed = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Highlight source with a registered Prism grammar, or return escaped plain text. */
export function highlightPrismCode(code: string, language: string): string {
  const normalized = normalizePrismLanguage(language);
  if (normalized === 'plain') return escapeHtml(code);

  const grammar = grammarForLanguage(normalized);
  if (!grammar) return escapeHtml(code);

  try {
    return highlight(code, grammar.grammar, grammar.id);
  } catch {
    return escapeHtml(code);
  }
}
