import { serializeCollectionPlanJson } from './components/CollectionJsonView';
import type { CollectionPlan } from './migrationPlanTypes';

/** JSON Crack embed origin (visualization engine). */
export const JSON_CRACK_WIDGET_URL = 'https://jsoncrack.com/widget';

const JSON_CRACK_IFRAME_ID = 'json-crack-embed';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Minimal standalone HTML document that loads JSON Crack and posts collection JSON when the widget is ready.
 */
export function buildJsonCrackViewerDocument(pageTitle: string, jsonPayload: string): string {
  const safeTitle = escapeHtml(pageTitle);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #001e2b; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <iframe id="${JSON_CRACK_IFRAME_ID}" src="${JSON_CRACK_WIDGET_URL}" title="JSON Crack"></iframe>
  <script>
    (function () {
      var iframe = document.getElementById(${JSON.stringify(JSON_CRACK_IFRAME_ID)});
      var json = ${JSON.stringify(jsonPayload)};
      window.addEventListener('message', function (event) {
        if (event.data === ${JSON.stringify(JSON_CRACK_IFRAME_ID)}) {
          iframe.contentWindow.postMessage(
            { json: json, options: { theme: 'dark', direction: 'RIGHT' } },
            '*'
          );
        }
      });
    })();
  </script>
</body>
</html>`;
}

/** Open the collection migration-plan slice in JSON Crack (new browser tab). */
export function openCollectionPlanInJsonCrack(collection: CollectionPlan): void {
  const json = serializeCollectionPlanJson(collection);
  const pageTitle = `${collection.name} · JSON Crack`;
  const html = buildJsonCrackViewerDocument(pageTitle, json);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const popup = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!popup) {
    URL.revokeObjectURL(blobUrl);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}
