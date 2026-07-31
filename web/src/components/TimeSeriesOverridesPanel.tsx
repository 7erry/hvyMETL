import type { TimeSeriesGranularity } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import {
  isActiveTimeSeriesOverride,
  suggestMetaFieldForTable,
  suggestTimeFieldForTable,
  type TimeSeriesOverride,
  type TimeSeriesOverrides,
} from '../timeSeriesOverrides';

const GRANULARITY_OPTIONS: { id: TimeSeriesGranularity; label: string }[] = [
  { id: 'seconds', label: 'seconds' },
  { id: 'minutes', label: 'minutes' },
  { id: 'hours', label: 'hours' },
];

type TimeSeriesOverridesPanelProps = {
  model: SqlStructuralModel;
  overrides: TimeSeriesOverrides;
  onChange: (overrides: TimeSeriesOverrides) => void;
};

export function TimeSeriesOverridesPanel({ model, overrides, onChange }: TimeSeriesOverridesPanelProps) {
  if (model.tables.length === 0) {
    return <p className="cardinality-overrides__hint">Import a schema to configure time series collections.</p>;
  }

  const updateTable = (tableName: string, patch: Partial<TimeSeriesOverride>) => {
    const current = overrides[tableName] ?? {
      timeField: suggestTimeFieldForTable(model.tables.find((table) => table.name === tableName)!),
      metaField: suggestMetaFieldForTable(model.tables.find((table) => table.name === tableName)!),
      granularity: 'seconds' as TimeSeriesGranularity,
    };
    const nextEntry = { ...current, ...patch };
    const next = { ...overrides };
    if (!isActiveTimeSeriesOverride(nextEntry)) {
      delete next[tableName];
    } else {
      next[tableName] = {
        timeField: nextEntry.timeField.trim(),
        ...(nextEntry.metaField?.trim() ? { metaField: nextEntry.metaField.trim() } : {}),
        granularity: nextEntry.granularity,
      };
    }
    onChange(next);
  };

  const clearTable = (tableName: string) => {
    const next = { ...overrides };
    delete next[tableName];
    onChange(next);
  };

  return (
    <div className="cardinality-overrides">
      <p className="cardinality-overrides__hint">
        Optional: map a SQL table to a native MongoDB time series collection. Set{' '}
        <code>timeseries.timeField</code>, optional <code>metaField</code>, and <code>granularity</code> for{' '}
        <code>db.createCollection</code>. Leave timeField empty to skip a table.
      </p>
      <div className="cardinality-overrides__list">
        {model.tables.map((table) => {
          const active = overrides[table.name];
          const timeField = active?.timeField ?? '';
          const metaField = active?.metaField ?? '';
          const granularity = active?.granularity ?? 'seconds';
          const enabled = isActiveTimeSeriesOverride(active);
          return (
            <div className="cardinality-overrides__row" key={table.name}>
              <span>
                <strong>{table.name}</strong>
                <small>
                  {enabled
                    ? `timeseries → ${timeField}${metaField ? ` · meta ${metaField}` : ''} · ${granularity}`
                    : 'not configured'}
                </small>
              </span>
              <div className="cardinality-overrides__controls cardinality-overrides__controls--wide">
                <label>
                  <span>timeField</span>
                  <input
                    type="text"
                    placeholder={suggestTimeFieldForTable(table) || 'recordedAt'}
                    value={timeField}
                    onChange={(event) => updateTable(table.name, { timeField: event.target.value })}
                  />
                </label>
                <label>
                  <span>metaField</span>
                  <input
                    type="text"
                    placeholder={suggestMetaFieldForTable(table) || 'optional'}
                    value={metaField}
                    onChange={(event) => updateTable(table.name, { metaField: event.target.value })}
                  />
                </label>
                <label>
                  <span>granularity</span>
                  <select
                    value={granularity}
                    onChange={(event) =>
                      updateTable(table.name, { granularity: event.target.value as TimeSeriesGranularity })
                    }
                    disabled={!timeField.trim()}
                  >
                    {GRANULARITY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {enabled ? (
                  <button type="button" className="secondary" onClick={() => clearTable(table.name)}>
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
