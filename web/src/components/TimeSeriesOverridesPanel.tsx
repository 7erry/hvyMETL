import type { TimeSeriesGranularity } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import {
  isActiveTimeSeriesOverride,
  metaFieldSelectOptions,
  suggestMetaFieldForTable,
  suggestTimeFieldForTable,
  timeFieldSelectOptions,
  type TimeSeriesFieldOption,
  type TimeSeriesOverride,
  type TimeSeriesOverrides,
} from '../timeSeriesOverrides';

const GRANULARITY_OPTIONS: { id: TimeSeriesGranularity; label: string }[] = [
  { id: 'seconds', label: 'seconds' },
  { id: 'minutes', label: 'minutes' },
  { id: 'hours', label: 'hours' },
];

function fieldOptionLabel(option: TimeSeriesFieldOption): string {
  return `${option.bsonField} (${option.columnName} · ${option.sqlType})`;
}

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
    const table = model.tables.find((entry) => entry.name === tableName);
    if (!table) return;
    const current = overrides[tableName] ?? {
      timeField: suggestTimeFieldForTable(table),
      metaField: suggestMetaFieldForTable(table),
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
        Optional: map a SQL table to a native MongoDB time series collection. Pick{' '}
        <code>timeseries.timeField</code>, optional <code>metaField</code>, and <code>granularity</code> for{' '}
        <code>db.createCollection</code>. Leave timeField unset to skip a table.
      </p>
      <div className="cardinality-overrides__list">
        {model.tables.map((table) => {
          const active = overrides[table.name];
          const timeField = active?.timeField ?? '';
          const metaField = active?.metaField ?? '';
          const granularity = active?.granularity ?? 'seconds';
          const enabled = isActiveTimeSeriesOverride(active);
          const timeOptions = timeFieldSelectOptions(table, timeField);
          const metaOptions = metaFieldSelectOptions(table, timeField, metaField);
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
                  <select
                    value={timeField}
                    onChange={(event) => updateTable(table.name, { timeField: event.target.value })}
                  >
                    <option value="">— not configured —</option>
                    {timeOptions.map((option) => (
                      <option key={option.bsonField} value={option.bsonField}>
                        {fieldOptionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>metaField</span>
                  <select
                    value={metaField}
                    onChange={(event) => updateTable(table.name, { metaField: event.target.value })}
                    disabled={!timeField.trim()}
                  >
                    <option value="">— none —</option>
                    {metaOptions.map((option) => (
                      <option key={option.bsonField} value={option.bsonField}>
                        {fieldOptionLabel(option)}
                      </option>
                    ))}
                  </select>
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
