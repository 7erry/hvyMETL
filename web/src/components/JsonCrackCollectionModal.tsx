import { useEffect, useMemo } from 'react';
import { JSONCrack } from 'jsoncrack-react';
import { normalizeCollectionPlan } from '../normalizeCollectionPlan';
import type { CollectionPlan } from '../migrationPlanTypes';

type JsonCrackCollectionModalProps = {
  open: boolean;
  collection: CollectionPlan | null;
  onClose: () => void;
};

/** In-app resizable dialog with the jsoncrack-react graph canvas for a collection plan. */
export function JsonCrackCollectionModal({ open, collection, onClose }: JsonCrackCollectionModalProps) {
  const plan = useMemo(
    () => (collection ? normalizeCollectionPlan(collection) : null),
    [collection],
  );

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
      <div className="pipeline-modal panel jsoncrack-collection-modal">
        <header className="pipeline-modal__header jsoncrack-collection-modal__header">
          <h2 id={titleId}>{plan.name}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close collection plan graph">
            ✕
          </button>
        </header>

        <div className="jsoncrack-collection-modal__canvas">
          <JSONCrack
            key={plan.name}
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
