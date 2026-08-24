import { useEffect, useRef } from 'react';
import type { CardinalityOverrides, EmbedDirectionOverrides, ForceEmbedOverrides } from '../cardinalityOverrides';
import {
  allRelationshipsForceEmbed,
  buildForceEmbedOverridesForAll,
  relationshipEmbedDirectionLabel,
  relationshipOverrideKey,
  someRelationshipsForceEmbed,
} from '../cardinalityOverrides';
import type { SqlStructuralModel } from '../types';

type CardinalityOverridesPanelProps = {
  model: SqlStructuralModel;
  overrides: CardinalityOverrides;
  forceEmbedOverrides: ForceEmbedOverrides;
  embedDirectionOverrides: EmbedDirectionOverrides;
  onChange: (
    overrides: CardinalityOverrides,
    forceEmbedOverrides: ForceEmbedOverrides,
    embedDirectionOverrides: EmbedDirectionOverrides,
  ) => void;
};

export function CardinalityOverridesPanel({
  model,
  overrides,
  forceEmbedOverrides,
  embedDirectionOverrides,
  onChange,
}: CardinalityOverridesPanelProps) {
  const setMaxChildren = (key: string, value: number) => {
    const next = { ...overrides };
    if (Number.isFinite(value) && value > 0) {
      next[key] = Math.max(1, Math.round(value));
    } else {
      delete next[key];
    }
    onChange(next, forceEmbedOverrides, embedDirectionOverrides);
  };

  const setForceEmbed = (key: string, isForced: boolean) => {
    const nextForce = { ...forceEmbedOverrides };
    const nextDirection = { ...embedDirectionOverrides };
    if (isForced) {
      nextForce[key] = true;
    } else {
      nextForce[key] = false;
      delete nextDirection[key];
    }
    onChange(overrides, nextForce, nextDirection);
  };

  const toggleEmbedDirection = (key: string) => {
    const nextForce = { ...forceEmbedOverrides, [key]: true };
    const nextDirection = { ...embedDirectionOverrides };
    if (nextDirection[key]) {
      delete nextDirection[key];
    } else {
      nextDirection[key] = true;
    }
    onChange(overrides, nextForce, nextDirection);
  };

  const allForced = allRelationshipsForceEmbed(model, forceEmbedOverrides);
  const someForced = someRelationshipsForceEmbed(model, forceEmbedOverrides);
  const forceAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (forceAllRef.current) {
      forceAllRef.current.indeterminate = someForced;
    }
  }, [someForced, allForced]);

  const setForceAll = (enabled: boolean) => {
    onChange(overrides, buildForceEmbedOverridesForAll(model, enabled), enabled ? embedDirectionOverrides : {});
  };

  if (model.relationships.length === 0) {
    return <p className="cardinality-overrides__hint">No foreign-key relationships were found in this schema.</p>;
  }

  return (
    <div className="cardinality-overrides">
      <p className="cardinality-overrides__hint">
        Optional: suggest max child rows per parent when CSV or live database stats are unavailable. Values up to
        5,000 are treated as bounded for embed decisions. Force embed to fold a linked table, then click the arrow to
        flip direction (which collection hosts the nested documents). Unchecking **Force embed** keeps the child as its
        own collection.
      </p>
      <label className="cardinality-overrides__force-all">
        <input
          ref={forceAllRef}
          type="checkbox"
          checked={allForced}
          onChange={(event) => setForceAll(event.currentTarget.checked)}
        />
        <span>Force All</span>
      </label>
      <div className="cardinality-overrides__list">
        {model.relationships.map((relationship) => {
          const key = relationshipOverrideKey(relationship);
          const value = overrides[key] ?? '';
          const forceEmbedChoice = forceEmbedOverrides[key];
          const isForced = forceEmbedChoice === true;
          const isSeparateCollection = forceEmbedChoice === false;
          const isReversed = embedDirectionOverrides[key] === true;
          const direction = relationshipEmbedDirectionLabel(relationship, isReversed);
          return (
            <div className="cardinality-overrides__row" key={key}>
              <span>
                <strong className="cardinality-overrides__direction">
                  <span>{direction.left}</span>
                  <button
                    type="button"
                    className="cardinality-overrides__arrow"
                    aria-label={`Toggle embed direction (${direction.guestTable} into ${direction.hostTable})`}
                    title={
                      isForced
                        ? `Embed ${direction.guestTable} into ${direction.hostTable}. Click to reverse.`
                        : 'Enable force embed to change direction'
                    }
                    onClick={() => toggleEmbedDirection(key)}
                  >
                    {direction.arrow}
                  </button>
                  <span>{direction.right}</span>
                </strong>
                <small>
                  {relationship.fkColumn} ·{' '}
                  {relationship.maxChildrenPerParent > 0 ? (
                    <>
                      min {relationship.minChildrenPerParent ?? '—'} · avg {relationship.avgChildrenPerParent} · p95{' '}
                      {relationship.p95ChildrenPerParent ?? '—'} · p99 {relationship.p99ChildrenPerParent ?? '—'} · max{' '}
                      {relationship.maxChildrenPerParent}
                      {relationship.cardinalitySource ? ` · ${relationship.cardinalitySource}` : ''} ·{' '}
                    </>
                  ) : (
                    <>Current max: unknown · </>
                  )}
                  {relationship.isBounded ? 'bounded' : 'unbounded'} ·{' '}
                  {isForced
                    ? `force embed: ${direction.guestTable} into ${direction.hostTable}`
                    : isSeparateCollection
                      ? 'separate collection'
                      : 'planner decides'}
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
