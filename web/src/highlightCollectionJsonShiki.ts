import type { HighlighterCore } from 'shiki/core';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import json from 'shiki/langs/json';
import materialThemeDarker from 'shiki/themes/material-theme-darker';
import { highlightCollectionJsonManual } from './highlightCollectionJson';

const MAX_JSON_CHARS = 200_000;

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getCollectionJsonHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [materialThemeDarker],
      langs: [json],
      engine: createOnigurumaEngine(() => import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

function truncateJson(json: string): string {
  if (json.length <= MAX_JSON_CHARS) return json;
  return `${json.slice(0, MAX_JSON_CHARS)}\n… truncated`;
}

/** Wrap manual fallback markup as a pre/code block for the inspector. */
function manualFallbackHtml(json: string): string {
  return `<pre class="collection-json collection-details__json-pre"><code class="language-json">${highlightCollectionJsonManual(json)}</code></pre>`;
}

/** Highlight JSON with Shiki; fall back to the manual highlighter if Shiki fails. */
export async function highlightCollectionJsonWithShiki(json: string): Promise<string> {
  const slice = truncateJson(json);
  try {
    const highlighter = await getCollectionJsonHighlighter();
    return highlighter.codeToHtml(slice, {
      lang: 'json',
      theme: 'material-theme-darker',
    });
  } catch {
    return manualFallbackHtml(slice);
  }
}
