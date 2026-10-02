import { useDeferredValue, useMemo } from 'react';
import { highlightCollectionJson } from '../highlightCollectionJson';
import type { CollectionPlan } from '../migrationPlanTypes';

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

type CollectionJsonViewProps = {
  collection: CollectionPlan;
};

/** Colorized read-only JSON for the collection migration-plan slice. */
export function CollectionJsonView({ collection }: CollectionJsonViewProps) {
  const jsonText = useMemo(() => serializeCollectionPlanJson(collection), [collection]);
  const deferredJson = useDeferredValue(jsonText);
  const html = useMemo(() => highlightCollectionJson(deferredJson), [deferredJson]);

  return (
    <pre className="collection-json prism-code-block collection-details__json-pre">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
