import type { HighlighterCore } from 'shiki/core';
import type { LanguageInput } from '@shikijs/types';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import json from 'shiki/langs/json';
import materialThemeDarker from 'shiki/themes/material-theme-darker';
import { highlightPrismCode } from './prismHighlight';

export const SHIKI_ARTIFACT_THEME = 'material-theme-darker';

const MAX_HIGHLIGHT_CHARS = 400_000;

type LangModule = { default: LanguageInput };

const SHIKI_LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  json: () => import('shiki/langs/json') as Promise<LangModule>,
  markdown: () => import('shiki/langs/markdown') as Promise<LangModule>,
  typescript: () => import('shiki/langs/typescript') as Promise<LangModule>,
  javascript: () => import('shiki/langs/javascript') as Promise<LangModule>,
  python: () => import('shiki/langs/python') as Promise<LangModule>,
  go: () => import('shiki/langs/go') as Promise<LangModule>,
  java: () => import('shiki/langs/java') as Promise<LangModule>,
  kotlin: () => import('shiki/langs/kotlin') as Promise<LangModule>,
  csharp: () => import('shiki/langs/csharp') as Promise<LangModule>,
  rust: () => import('shiki/langs/rust') as Promise<LangModule>,
  ruby: () => import('shiki/langs/ruby') as Promise<LangModule>,
  php: () => import('shiki/langs/php') as Promise<LangModule>,
  swift: () => import('shiki/langs/swift') as Promise<LangModule>,
  c: () => import('shiki/langs/c') as Promise<LangModule>,
  cpp: () => import('shiki/langs/cpp') as Promise<LangModule>,
  scala: () => import('shiki/langs/scala') as Promise<LangModule>,
  yaml: () => import('shiki/langs/yaml') as Promise<LangModule>,
  sql: () => import('shiki/langs/sql') as Promise<LangModule>,
  bash: () => import('shiki/langs/bash') as Promise<LangModule>,
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
let highlighterInstance: HighlighterCore | null = null;
const loadedLanguages = new Set<string>(['json']);

/** Map artifact / Prism language ids to Shiki grammar ids. */
export function normalizeShikiLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized === 'plain' || normalized === 'plaintext') return 'plaintext';
  if (normalized === 'ts') return 'typescript';
  if (normalized === 'js') return 'javascript';
  if (normalized === 'py') return 'python';
  if (normalized === 'yml') return 'yaml';
  if (normalized === 'cs') return 'csharp';
  if (normalized === 'rs') return 'rust';
  if (normalized === 'rb') return 'ruby';
  if (normalized === 'md') return 'markdown';
  return normalized;
}

async function getArtifactHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [materialThemeDarker],
      langs: [json],
      engine: createOnigurumaEngine(() => import('shiki/wasm')),
    }).then((highlighter) => {
      highlighterInstance = highlighter;
      return highlighter;
    });
  }
  return highlighterPromise;
}

function truncateForHighlight(code: string): string {
  if (code.length <= MAX_HIGHLIGHT_CHARS) return code;
  return `${code.slice(0, MAX_HIGHLIGHT_CHARS)}\n… truncated`;
}

/** Load a Shiki grammar for migration export tabs (no-op for plaintext). */
export async function ensureShikiLanguage(language: string): Promise<void> {
  const lang = normalizeShikiLanguage(language);
  if (lang === 'plaintext' || loadedLanguages.has(lang)) return;
  const loader = SHIKI_LANG_LOADERS[lang];
  if (!loader) return;
  const highlighter = await getArtifactHighlighter();
  const mod = await loader();
  await highlighter.loadLanguage(mod.default);
  loadedLanguages.add(lang);
}

/** Full Shiki HTML document fragment for read-only panels. */
export async function highlightArtifactCodeToHtml(code: string, language: string): Promise<string> {
  const lang = normalizeShikiLanguage(language);
  const slice = truncateForHighlight(code);
  if (lang === 'plaintext') {
    return `<pre class="artifact-code-pre artifact-shiki-fallback"><code>${escapeHtml(slice)}</code></pre>`;
  }
  try {
    await ensureShikiLanguage(lang);
    const highlighter = await getArtifactHighlighter();
    return highlighter.codeToHtml(slice, { lang, theme: SHIKI_ARTIFACT_THEME });
  } catch {
    return `<pre class="artifact-code-pre artifact-shiki-fallback"><code>${highlightPrismCode(slice, language)}</code></pre>`;
  }
}

/** Synchronous Shiki highlight after the grammar is loaded (for the code editor overlay). */
export function highlightArtifactCodeToHtmlSync(code: string, language: string): string | null {
  const lang = normalizeShikiLanguage(language);
  if (lang === 'plaintext' || !loadedLanguages.has(lang) || !highlighterInstance) return null;
  const slice = truncateForHighlight(code);
  try {
    return highlighterInstance.codeToHtml(slice, { lang, theme: SHIKI_ARTIFACT_THEME });
  } catch {
    return null;
  }
}

/** Inner HTML for react-simple-code-editor (strip Shiki pre/code wrapper). */
export function shikiHtmlToEditorMarkup(fullHtml: string): string {
  const match = fullHtml.match(/<code[^>]*>([\s\S]*)<\/code>/i);
  return match?.[1] ?? fullHtml;
}

/** Shiki when ready, otherwise Prism, for editable artifact tabs. */
export function highlightArtifactForEditor(code: string, language: string): string {
  const shikiHtml = highlightArtifactCodeToHtmlSync(code, language);
  if (shikiHtml) return shikiHtmlToEditorMarkup(shikiHtml);
  return highlightPrismCode(code, language);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
