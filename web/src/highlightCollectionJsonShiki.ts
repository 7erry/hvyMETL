import { highlightCollectionJsonManual } from './highlightCollectionJson';
import { highlightArtifactCodeToHtml } from './shikiArtifactHighlight';

const MAX_JSON_CHARS = 200_000;

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
    return await highlightArtifactCodeToHtml(slice, 'json');
  } catch {
    return manualFallbackHtml(slice);
  }
}
