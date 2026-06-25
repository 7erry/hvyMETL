import { useMemo } from 'react';
import type { CollectionReviewItem } from '../managerReview';

type ManagerReviewModalProps = {
  open: boolean;
  items: CollectionReviewItem[];
  onClose: () => void;
  onAccept: (collectionName: string) => void;
  onAcceptAll: () => void;
  focusCollectionName?: string | null;
};

export function ManagerReviewModal({
  open,
  items,
  onClose,
  onAccept,
  onAcceptAll,
  focusCollectionName,
}: ManagerReviewModalProps) {
  const pending = useMemo(() => items.filter((item) => !item.accepted), [items]);
  const acceptedCount = items.length - pending.length;

  if (!open) return null;

  const sortedItems = focusCollectionName
    ? [...items].sort((a, b) => {
        if (a.collectionName === focusCollectionName) return -1;
        if (b.collectionName === focusCollectionName) return 1;
        return a.collectionName.localeCompare(b.collectionName);
      })
    : items;

  return (
    <div className="manager-review-backdrop" role="presentation" onClick={onClose}>
      <div
        className="manager-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="manager-review-modal__header">
          <div>
            <h2 id="manager-review-title">Review recommended changes</h2>
            <p className="manager-review-modal__subtitle">
              {acceptedCount} of {items.length} accepted
              {pending.length > 0 ? ` · ${pending.length} remaining` : ' · all collections approved'}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close review">
            Close
          </button>
        </header>

        {items.length === 0 ? (
          <p className="manager-hint">No collections require review for this migration plan.</p>
        ) : (
          <>
            {pending.length > 0 ? (
              <div className="manager-review-modal__actions">
                <button type="button" className="primary" onClick={onAcceptAll}>
                  Accept all {pending.length} recommendation(s)
                </button>
              </div>
            ) : null}

            <ul className="manager-review-list">
              {sortedItems.map((item) => (
                <li
                  key={item.collectionName}
                  className={`manager-review-card${item.accepted ? ' manager-review-card--accepted' : ''}${
                    focusCollectionName === item.collectionName ? ' manager-review-card--focus' : ''
                  }`}
                >
                  <div className="manager-review-card__header">
                    <div>
                      <h3>{item.collectionName}</h3>
                      <p className="manager-review-card__meta">
                        Source table: <code>{item.sourceTable}</code>
                      </p>
                    </div>
                    {item.accepted ? (
                      <span className="manager-review-badge manager-review-badge--accepted">Accepted</span>
                    ) : (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onAccept(item.collectionName)}
                      >
                        Accept recommendations
                      </button>
                    )}
                  </div>

                  <ul className="manager-review-recommendations">
                    {item.recommendations.map((rec) => (
                      <li key={rec.id} className={`manager-review-rec manager-review-rec--${rec.category}`}>
                        <strong>{rec.title}</strong>
                        <p>{rec.detail}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
