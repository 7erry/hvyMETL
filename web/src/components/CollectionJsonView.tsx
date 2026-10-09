import { useMemo } from 'react';
import type { CollectionPlan } from '../migrationPlanTypes';
import { ShikiCodeBlock } from './ShikiCodeBlock';

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

/** Shiki-highlighted read-only JSON for a collection $jsonSchema. */
export function CollectionJsonView({ collection }: { collection: CollectionPlan }) {
  const jsonText = useMemo(
    () => serializeJsonForDisplay(collection.jsonSchema, 'Schema'),
    [collection.jsonSchema],
  );
  return (
    <ShikiCodeBlock
      code={jsonText}
      language="json"
      className="collection-json"
      preClassName="collection-details__json-pre"
    />
  );
}
