import { downloadJson } from '../api';
import type { CollectionPlan } from '../migrationPlanTypes';
import { CollectionJsonView } from './CollectionJsonView';

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
  if (!collection) return null;

  const mergedTables = collection.mergedTables ?? [];
  const idDerivation = collection.idDerivation ?? { strategy: 'direct' as const, sourceColumns: ['_id'] };
  const sourceColumns = idDerivation.sourceColumns ?? [];

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
        {mergedTables.length > 1
          ? ` · merged: ${mergedTables.filter((t) => t !== collection.sourceTable).join(', ')}`
          : ''}
        {' · '}
        _id: {idDerivation.strategy} ({sourceColumns.join(', ')})
      </p>

      <div className="collection-details__json" aria-label={`${collection.name} migration plan JSON`}>
        <CollectionJsonView collection={collection} />
      </div>
    </div>
  );
}
