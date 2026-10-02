import { useMemo } from 'react';
import type { CollectionPlan } from '../migrationPlanTypes';

const MAX_JSON_CHARS = 200_000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Serialize collection plan for display (never throws). */
export function serializeCollectionPlanJson(collection: CollectionPlan): string {
  try {
    return JSON.stringify(collection, null, 2);
  } catch {
    return JSON.stringify(
      {
        name: collection.name,
        sourceTable: collection.sourceTable,
        error: 'Plan could not be serialized for display.',
      },
      null,
      2,
    );
  }
}

/** Lightweight JSON syntax colors (avoids Prism stack issues on large schemas). */
function highlightJsonHtml(json: string): string {
  const slice = json.length > MAX_JSON_CHARS ? `${json.slice(0, MAX_JSON_CHARS)}\n… truncated` : json;
  const escaped = escapeHtml(slice);
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, _quoted, colon) => {
      if (colon) return `<span class="collection-json__key">${match}</span>`;
      if (match.startsWith('"')) return `<span class="collection-json__string">${match}</span>`;
      if (match === 'true' || match === 'false') return `<span class="collection-json__boolean">${match}</span>`;
      if (match === 'null') return `<span class="collection-json__null">${match}</span>`;
      return `<span class="collection-json__number">${match}</span>`;
    },
  );
}

type CollectionJsonViewProps = {
  collection: CollectionPlan;
};

/** Colorized read-only JSON for the collection migration-plan slice. */
export function CollectionJsonView({ collection }: CollectionJsonViewProps) {
  const html = useMemo(() => highlightJsonHtml(serializeCollectionPlanJson(collection)), [collection]);

  return (
    <pre className="collection-json prism-code-block collection-details__json-pre">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
