import { highlightPrismCode } from './prismHighlight';

const MAX_JSON_CHARS = 200_000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Read a JSON string literal starting at the opening quote index. */
function readJsonString(text: string, start: number): { literal: string; end: number } {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '"') {
      return { literal: text.slice(start, index + 1), end: index + 1 };
    }
    index += 1;
  }
  return { literal: text.slice(start), end: text.length };
}

function span(className: string, text: string): string {
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

/**
 * Line-safe JSON highlighter: property keys (quote before `:`) vs string values,
 * plus distinct punctuation, numbers, booleans, and null.
 */
export function highlightCollectionJsonManual(json: string): string {
  const slice = json.length > MAX_JSON_CHARS ? `${json.slice(0, MAX_JSON_CHARS)}\n… truncated` : json;
  let output = '';
  let index = 0;

  while (index < slice.length) {
    const char = slice[index];

    if (char === '"') {
      const { literal, end } = readJsonString(slice, index);
      const after = slice.slice(end).match(/^\s*:/);
      output += span(after ? 'collection-json__property' : 'collection-json__string', literal);
      index = end;
      continue;
    }

    if (/[{}\[\],:]/.test(char)) {
      output += span('collection-json__punctuation', char);
      index += 1;
      continue;
    }

    if (/[-0-9]/.test(char)) {
      const match = slice.slice(index).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        output += span('collection-json__number', match[0]);
        index += match[0].length;
        continue;
      }
    }

    if (slice.startsWith('true', index) || slice.startsWith('false', index) || slice.startsWith('null', index)) {
      const keyword = slice.startsWith('true', index)
        ? 'true'
        : slice.startsWith('false', index)
          ? 'false'
          : 'null';
      output += span(keyword === 'null' ? 'collection-json__null' : 'collection-json__boolean', keyword);
      index += keyword.length;
      continue;
    }

    output += escapeHtml(char);
    index += 1;
  }

  return output;
}

/** Prefer Prism JSON tokens; fall back to the manual highlighter. */
export function highlightCollectionJson(json: string): string {
  const slice = json.length > MAX_JSON_CHARS ? `${json.slice(0, MAX_JSON_CHARS)}\n… truncated` : json;
  try {
    const html = highlightPrismCode(slice, 'json');
    if (html.includes('class="token') || html.includes("class='token")) return html;
  } catch {
    // use manual highlighter
  }
  return highlightCollectionJsonManual(slice);
}
