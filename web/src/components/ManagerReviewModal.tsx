import { useMemo, useState } from 'react';
import type { CollectionReviewItem } from '../managerReview';

type ManagerReviewModalProps = {
  open: boolean;
  items: CollectionReviewItem[];
  onClose: () => void;
  onAccept: (collectionName: string) => void;
  onAcceptAll: () => void;
  onRejectTable: (collectionName: string, tableName: string, reason: string) => void;
  focusCollectionName?: string | null;
};

function reviewReasonKey(collectionName: string, tableName: string): string {
  return `${collectionName}:${tableName}`;
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function ManagerReviewModal({
  open,
  items,
  onClose,
  onAccept,
  onAcceptAll,
  onRejectTable,
  focusCollectionName,
}: ManagerReviewModalProps) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const pending = useMemo(() => items.filter((item) => !item.resolved), [items]);
  const acceptedCount = items.filter((item) => item.accepted).length;
  const rejectedCount = items.filter((item) => !item.accepted && item.resolved).length;

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
              {acceptedCount} accepted · {rejectedCount} rejected
              {pending.length > 0 ? ` · ${pending.length} remaining` : ' · all recommendations resolved'}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose} aria-label="Close review">
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
                  Accept all changes
                </button>
              </div>
            ) : null}

            <ul className="manager-review-list">
              {sortedItems.map((item) => (
                <li
                  key={item.collectionName}
                  className={`manager-review-card${item.accepted ? ' manager-review-card--accepted' : ''}${
                    !item.accepted && item.resolved ? ' manager-review-card--rejected' : ''
                  }${
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
                    ) : item.resolved ? (
                      <span className="manager-review-badge manager-review-badge--rejected">Rejected with audit</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onAccept(item.collectionName)}
                      >
                        Accept changes
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

                  {item.rejectableTables.length > 0 ? (
                    <section className="manager-review-rejections" aria-label={`Reject table changes for ${item.collectionName}`}>
                      <h4>Reject table change</h4>
                      <p className="manager-review-card__meta">
                        Rejected tables will be treated as standalone MongoDB collections for manager sign-off.
                      </p>
                      {item.rejectableTables.map((tableName) => {
                        const rejected = item.rejectedTables.find((entry) => entry.tableName === tableName);
                        const key = reviewReasonKey(item.collectionName, tableName);
                        const reason = reasons[key] ?? '';
                        if (rejected) {
                          return (
                            <div key={tableName} className="manager-review-rejection manager-review-rejection--done">
                              <div>
                                <strong>{tableName}</strong>
                                <p>Rejected: keep as its own collection.</p>
                                <p className="manager-review-audit">
                                  {formatAuditTime(rejected.decidedAt)} · {rejected.reason}
                                </p>
                              </div>
                              <span className="manager-review-badge manager-review-badge--rejected">Rejected</span>
                            </div>
                          );
                        }

                        return (
                          <div key={tableName} className="manager-review-rejection">
                            <label>
                              <span>Reason to keep <code>{tableName}</code> as a collection</span>
                              <textarea
                                value={reason}
                                rows={2}
                                onChange={(event) => {
                                  const nextReason = event.currentTarget.value;
                                  setReasons((prev) => ({ ...prev, [key]: nextReason }));
                                }}
                                placeholder="Example: Compliance requires this table to remain independently queryable."
                              />
                            </label>
                            <button
                              type="button"
                              className="secondary"
                              disabled={!reason.trim()}
                              onClick={() => {
                                onRejectTable(item.collectionName, tableName, reason);
                                setReasons((prev) => ({ ...prev, [key]: '' }));
                              }}
                            >
                              Reject and keep as collection
                            </button>
                          </div>
                        );
                      })}
                    </section>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
