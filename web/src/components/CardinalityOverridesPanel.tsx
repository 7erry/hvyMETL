import type { CardinalityOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import { relationshipLabel, relationshipOverrideKey } from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';

type CardinalityOverridesPanelProps = {
  model: SqlStructuralModel;
  overrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  onChange: (overrides: CardinalityOverrides, forceEmbedOverrides: ForceEmbedOverrides) => void;
};

export function CardinalityOverridesPanel({
  model,
  overrides,
  forceEmbedOverrides,
  onChange,
}: CardinalityOverridesPanelProps) {
  const setMaxChildren = (key: string, value: number) => {
    const next = { ...overrides };
    if (Number.isFinite(value) && value > 0) {
      next[key] = Math.max(1, Math.round(value));
    } else {
      delete next[key];
    }
    onChange(next, forceEmbedOverrides);
  };

  const setForceEmbed = (key: string, isForced: boolean) => {
    const next = { ...forceEmbedOverrides };
    if (isForced) {
      next[key] = true;
    } else {
      delete next[key];
    }
    onChange(overrides, next);
  };

  if (model.relationships.length === 0) {
    return <p className="cardinality-overrides__hint">No foreign-key relationships were found in this schema.</p>;
  }

  return (
    <div className="cardinality-overrides">
      <p className="cardinality-overrides__hint">
        Optional: suggest max child rows per parent when CSV or live database stats are unavailable. Values up to
        5,000 are treated as bounded for embed decisions. You can also force a linked child table to embed into its
        parent collection.
      </p>
      <div className="cardinality-overrides__list">
        {model.relationships.map((relationship) => {
          const key = relationshipOverrideKey(relationship);
          const value = overrides[key] ?? '';
          const isForced = forceEmbedOverrides[key] === true;
          return (
            <div className="cardinality-overrides__row" key={key}>
              <span>
                <strong>{relationshipLabel(relationship)}</strong>
                <small>
                  Current max: {relationship.maxChildrenPerParent || 'unknown'} ·{' '}
                  {relationship.isBounded ? 'bounded' : 'unbounded'} · {isForced ? 'force embed enabled' : 'planner decides'}
                </small>
              </span>
              <div className="cardinality-overrides__controls">
                <label>
                  <span>Max</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="max"
                    value={value}
                    onChange={(event) => setMaxChildren(key, Number(event.currentTarget.value))}
                  />
                </label>
                <label className="cardinality-overrides__force">
                  <input
                    type="checkbox"
                    checked={isForced}
                    onChange={(event) => setForceEmbed(key, event.currentTarget.checked)}
                  />
                  <span>Force embed</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
