import { useMemo } from 'react';
import { downloadJson } from '../api';
import type { CollectionPlan } from '../migrationPlanTypes';
import { PrismCodeBlock } from './PrismCodeBlock';

type CollectionDetailsProps = {
  collection: CollectionPlan | null;
  onClose: () => void;
};

function downloadCollectionJson(collection: CollectionPlan): void {
  downloadJson(`${collection.name}.json`, collection);
}

/** Monospace `{ }` glyph for JSON download affordance. */
function JsonDownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden focusable="false">
      <text
        x="12"
        y="12"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="currentColor"
        fontSize="11"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
      >
        {'{ }'}
      </text>
    </svg>
  );
}

export function CollectionDetails({ collection, onClose }: CollectionDetailsProps) {
  const collectionJson = useMemo(
    () => (collection ? JSON.stringify(collection, null, 2) : ''),
    [collection],
  );

  if (!collection) return null;

  return (
    <div className="panel table-details collection-details">
      <div className="collection-details__header">
        <div className="collection-details__title">
          <h3>{collection.name}</h3>
          <button
            type="button"
            className="btn-icon collection-details__json-download"
            onClick={() => downloadCollectionJson(collection)}
            title={`Download ${collection.name}.json`}
            aria-label={`Download ${collection.name} as JSON`}
          >
            <JsonDownloadIcon />
          </button>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close collection details">
          ✕
        </button>
      </div>

      <p className="collection-details__meta">
        Source table: <code>{collection.sourceTable}</code>
        {collection.mergedTables.length > 1
          ? ` · merged: ${collection.mergedTables.filter((t) => t !== collection.sourceTable).join(', ')}`
          : ''}
        {' · '}
        _id: {collection.idDerivation.strategy} ({collection.idDerivation.sourceColumns.join(', ')})
      </p>

      <div className="collection-details__json" aria-label={`${collection.name} migration plan JSON`}>
        <PrismCodeBlock code={collectionJson} language="json" preClassName="collection-details__json-pre" />
      </div>
    </div>
  );
}
