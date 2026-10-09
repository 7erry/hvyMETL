import { useId } from 'react';
import { downloadJson } from '../api';
import { normalizeCollectionPlan } from '../normalizeCollectionPlan';
import type { CollectionPlan } from '../migrationPlanTypes';
import type { SchemaField } from '../schema/schemaFields';
import { CollectionJsonView } from './CollectionJsonView';
import { SchemaFieldTree } from './SchemaFieldTree';

export type CollectionInspectorView = 'table' | 'json';

type CollectionDetailsProps = {
  collection: CollectionPlan | null;
  schemaFields: SchemaField[];
  viewMode: CollectionInspectorView;
  onViewModeChange: (mode: CollectionInspectorView) => void;
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

function CollectionPatternList({ plan }: { plan: CollectionPlan }) {
  if (plan.patterns.length === 0) return null;
  return (
    <>
      <h4 className="table-details__section">Patterns</h4>
      <ul className="table-details__rels">
        {plan.patterns.map((p) => (
          <li key={`${p.pattern}-${p.target}`}>
            <code>{p.pattern}</code>
            <span className="rel-arrow">→</span>
            <span>{p.target}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function CollectionPlanDetailSections({ plan }: { plan: CollectionPlan }) {
  return (
    <>
      {plan.indexes.length > 0 ? (
        <>
          <h4 className="table-details__section">Indexes</h4>
          <ul className="table-details__rels">
            {plan.indexes.map((idx) => (
              <li key={idx.options.name}>
                <code>{idx.options.name}</code>
                <span className="rel-arrow">·</span>
                {Object.entries(idx.keys)
                  .map(([k, dir]) => `${k}:${dir}`)
                  .join(', ')}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {plan.embeddedArrays.length > 0 ? (
        <>
          <h4 className="table-details__section">Embedded arrays</h4>
          <ul className="table-details__rels">
            {plan.embeddedArrays.map((e) => (
              <li key={e.field}>
                <code>{e.field}</code>
                <span className="rel-arrow">←</span>
                {e.sourceTable}.{e.joinColumn}
                {e.subsetLimit != null ? ` (subset ${e.subsetLimit})` : ''}
                {e.overflowCollection ? ` → overflow: ${e.overflowCollection}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {plan.extendedReferences.length > 0 ? (
        <>
          <h4 className="table-details__section">Extended references</h4>
          <ul className="table-details__rels">
            {plan.extendedReferences.map((e) => (
              <li key={e.field}>
                <code>{e.field}</code>
                <span className="rel-arrow">←</span>
                {e.sourceTable} via {e.viaColumn} ({e.lookupColumns.join(', ')})
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {plan.computedFields.length > 0 ? (
        <>
          <h4 className="table-details__section">Computed fields</h4>
          <ul className="table-details__rels">
            {plan.computedFields.map((f) => (
              <li key={f.field}>
                <code>{f.field}</code>
                <span className="rel-arrow">·</span>
                {f.description}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {plan.bucket ? (
        <p className="collection-details__footnote">
          Bucket: {plan.bucket.windowMinutes}m windows on {plan.bucket.groupByColumn} / {plan.bucket.timeColumn} →{' '}
          {plan.bucket.measurementsField}[]
        </p>
      ) : null}

      {plan.timeSeries ? (
        <p className="collection-details__footnote">
          Time series: timeField={plan.timeSeries.timeField}
          {plan.timeSeries.metaField ? `, metaField=${plan.timeSeries.metaField}` : ''}, granularity=
          {plan.timeSeries.granularity}
          {plan.timeSeries.expireAfterSeconds ? `, expireAfterSeconds=${plan.timeSeries.expireAfterSeconds}` : ''}
        </p>
      ) : null}

      {plan.archive ? (
        <p className="collection-details__footnote">
          Archive: {plan.archive.archiveAfterDays}d → {plan.archive.archiveCollection}
        </p>
      ) : null}
    </>
  );
}

export function CollectionDetails({
  collection,
  schemaFields,
  viewMode,
  onViewModeChange,
  onClose,
}: CollectionDetailsProps) {
  const toggleId = useId();

  if (!collection) return null;

  const plan = normalizeCollectionPlan(collection);
  const mergedTables = plan.mergedTables;
  const idDerivation = plan.idDerivation;
  const sourceColumns = idDerivation.sourceColumns ?? [];

  return (
    <div className="panel table-details collection-details">
      <div className="collection-details__header">
        <div className="collection-details__title">
          <h3>{plan.name}</h3>
          <button
            type="button"
            className="btn-icon collection-details__json-download"
            onClick={() => downloadCollectionJson(plan)}
            title={`Download ${plan.name}.json`}
            aria-label={`Download ${plan.name} as JSON`}
          >
            <JsonDownloadIcon />
          </button>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close collection details">
          ✕
        </button>
      </div>

      <p className="collection-details__meta">
        Source table: <code>{plan.sourceTable}</code>
        {mergedTables.length > 1
          ? ` · merged: ${mergedTables.filter((t) => t !== plan.sourceTable).join(', ')}`
          : ''}
        {' · '}
        _id: {idDerivation.strategy} ({sourceColumns.join(', ')})
      </p>

      <div className="collection-details__body">
        <CollectionPatternList plan={plan} />

        <div className="collection-details__fields">
          <div className="collection-details__view-toggle" role="group" aria-labelledby={toggleId}>
            <span id={toggleId} className="collection-details__view-toggle-label">
              Fields
            </span>
            <div className="collection-details__segmented ha-segmented">
              <button
                type="button"
                className={`ha-segmented__btn${viewMode === 'table' ? ' active' : ''}`}
                aria-pressed={viewMode === 'table'}
                onClick={() => onViewModeChange('table')}
              >
                Table
              </button>
              <button
                type="button"
                className={`ha-segmented__btn${viewMode === 'json' ? ' active' : ''}`}
                aria-pressed={viewMode === 'json'}
                onClick={() => onViewModeChange('json')}
              >
                JSON
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <SchemaFieldTree fields={schemaFields} collection={plan} variant="inspector" />
          ) : (
            <div className="collection-details__json" aria-label={`${plan.name} $jsonSchema`}>
              <CollectionJsonView collection={plan} />
            </div>
          )}
        </div>

        <CollectionPlanDetailSections plan={plan} />
      </div>
    </div>
  );
}
