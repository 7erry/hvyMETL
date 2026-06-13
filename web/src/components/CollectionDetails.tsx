import type { CollectionFieldRow } from '../migrationPlanDisplay';
import type { CollectionPlan } from '../migrationPlanTypes';

type CollectionDetailsProps = {
  collection: CollectionPlan | null;
  fields: CollectionFieldRow[];
  onClose: () => void;
};

export function CollectionDetails({ collection, fields, onClose }: CollectionDetailsProps) {
  if (!collection) return null;

  return (
    <div className="panel table-details collection-details">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>{collection.name}</h3>
        <button type="button" className="ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', opacity: 0.85 }}>
        Source table: <code>{collection.sourceTable}</code>
        {collection.mergedTables.length > 1
          ? ` · merged: ${collection.mergedTables.filter((t) => t !== collection.sourceTable).join(', ')}`
          : ''}
        {' · '}
        _id: {collection.idDerivation.strategy} ({collection.idDerivation.sourceColumns.join(', ')})
      </p>

      {collection.patterns.length > 0 ? (
        <>
          <h4 className="table-details__section">Patterns</h4>
          <ul className="table-details__rels">
            {collection.patterns.map((p) => (
              <li key={`${p.pattern}-${p.target}`}>
                <code>{p.pattern}</code>
                <span className="rel-arrow">→</span>
                <span>{p.target}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <table className="details-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>BSON type</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <td className={field.tags.includes('id') ? 'pk' : ''}>{field.name}</td>
              <td>{field.bsonType}</td>
              <td>{field.tags.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {collection.indexes.length > 0 ? (
        <>
          <h4 className="table-details__section">Indexes</h4>
          <ul className="table-details__rels">
            {collection.indexes.map((idx) => (
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

      {collection.embeddedArrays.length > 0 ? (
        <>
          <h4 className="table-details__section">Embedded arrays</h4>
          <ul className="table-details__rels">
            {collection.embeddedArrays.map((e) => (
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

      {collection.extendedReferences.length > 0 ? (
        <>
          <h4 className="table-details__section">Extended references</h4>
          <ul className="table-details__rels">
            {collection.extendedReferences.map((e) => (
              <li key={e.field}>
                <code>{e.field}</code>
                <span className="rel-arrow">←</span>
                {e.sourceTable} via {e.viaColumn} ({e.lookupColumns.join(', ')})
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {collection.computedFields.length > 0 ? (
        <>
          <h4 className="table-details__section">Computed fields</h4>
          <ul className="table-details__rels">
            {collection.computedFields.map((f) => (
              <li key={f.field}>
                <code>{f.field}</code>
                <span className="rel-arrow">·</span>
                {f.description}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {collection.bucket ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
          Bucket: {collection.bucket.windowMinutes}m windows on {collection.bucket.groupByColumn} /{' '}
          {collection.bucket.timeColumn} → {collection.bucket.measurementsField}[]
        </p>
      ) : null}

      {collection.archive ? (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
          Archive: {collection.archive.archiveAfterDays}d → {collection.archive.archiveCollection}
        </p>
      ) : null}
    </div>
  );
}
