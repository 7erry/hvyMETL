import { useDeferredValue, useMemo } from 'react';
import { highlightCollectionJson } from '../highlightCollectionJson';
import type { CollectionPlan } from '../migrationPlanTypes';

/** Serialize a value for display (never throws). */
export function serializeJsonForDisplay(value: unknown, fallbackLabel: string): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: `${fallbackLabel} could not be serialized for display.` }, null, 2);
  }
}

/** Serialize full collection plan for download / export (never throws). */
export function serializeCollectionPlanJson(collection: CollectionPlan): string {
  return serializeJsonForDisplay(collection, 'Plan');
}

type CollectionJsonViewProps = {
  collection: CollectionPlan;
  /** `jsonSchema` shows field/BSON definitions; `plan` shows the full collection slice. */
  variant?: 'jsonSchema' | 'plan';
};

/** Colorized read-only JSON for collection fields or the full migration-plan slice. */
export function CollectionJsonView({ collection, variant = 'jsonSchema' }: CollectionJsonViewProps) {
  const payload = variant === 'jsonSchema' ? collection.jsonSchema : collection;
  const jsonText = useMemo(
    () => serializeJsonForDisplay(payload, variant === 'jsonSchema' ? 'Schema' : 'Plan'),
    [payload, variant],
  );
  const deferredJson = useDeferredValue(jsonText);
  const html = useMemo(() => highlightCollectionJson(deferredJson), [deferredJson]);

  return (
    <pre className="collection-json prism-code-block collection-details__json-pre">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
