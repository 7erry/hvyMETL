import { useEffect, useMemo, useState } from 'react';
import { JSONCrack } from 'jsoncrack-react';
import { normalizeCollectionPlan } from '../normalizeCollectionPlan';
import type { CollectionPlan } from '../migrationPlanTypes';

type JsonCrackCollectionModalProps = {
  open: boolean;
  collection: CollectionPlan | null;
  onClose: () => void;
};

/** In-app dialog with the jsoncrack-react graph canvas for a collection plan. */
export function JsonCrackCollectionModal({ open, collection, onClose }: JsonCrackCollectionModalProps) {
  const [expanded, setExpanded] = useState(false);

  const plan = useMemo(
    () => (collection ? normalizeCollectionPlan(collection) : null),
    [collection],
  );

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !plan) return null;

  const titleId = 'jsoncrack-collection-title';
  const modalClass = [
    'pipeline-modal',
    'panel',
    'jsoncrack-collection-modal',
    expanded ? 'jsoncrack-collection-modal--expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="pipeline-overlay jsoncrack-collection-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={modalClass}>
        <header className="pipeline-modal__header jsoncrack-collection-modal__header">
          <div>
            <h2 id={titleId}>{plan.name}</h2>
            <p className="pipeline-modal__subtitle">JSON Crack · collection plan</p>
          </div>
          <div className="jsoncrack-collection-modal__header-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setExpanded((prev) => !prev)}
              aria-pressed={expanded}
              aria-label={expanded ? 'Restore dialog size' : 'Expand dialog to full screen'}
              title={expanded ? 'Restore size' : 'Expand'}
            >
              {expanded ? '⤡' : '⤢'}
            </button>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close JSON Crack dialog">
              ✕
            </button>
          </div>
        </header>

        <div className="jsoncrack-collection-modal__canvas">
          <JSONCrack
            key={`${plan.name}-${expanded ? 'expanded' : 'default'}`}
            json={plan}
            theme="dark"
            layoutDirection="RIGHT"
            showControls
            showGrid
            trackpadZoom
            centerOnLayout
            className="jsoncrack-collection-modal__graph"
          />
        </div>
      </div>
    </div>
  );
}
