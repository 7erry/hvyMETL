import { useCallback, useEffect, useRef } from 'react';
import type { CollectionPlan } from '../migrationPlanTypes';
import {
  JSON_CRACK_IFRAME_ID,
  JSON_CRACK_ORIGIN,
  JSON_CRACK_WIDGET_URL,
  buildJsonCrackPostMessage,
  collectionPlanJsonForJsonCrack,
  isJsonCrackReadyMessage,
} from '../jsonCrackEmbed';

type JsonCrackCollectionModalProps = {
  open: boolean;
  collection: CollectionPlan | null;
  onClose: () => void;
};

/** Full-screen dialog embedding JSON Crack with the collection migration-plan JSON. */
export function JsonCrackCollectionModal({ open, collection, onClose }: JsonCrackCollectionModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const jsonRef = useRef('');

  useEffect(() => {
    jsonRef.current = collection ? collectionPlanJsonForJsonCrack(collection) : '';
  }, [collection]);

  const pushJsonToWidget = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !jsonRef.current) return;
    iframe.contentWindow.postMessage(
      buildJsonCrackPostMessage(jsonRef.current),
      JSON_CRACK_ORIGIN,
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    function onMessage(event: MessageEvent) {
      if (!isJsonCrackReadyMessage(event, JSON_CRACK_IFRAME_ID)) return;
      pushJsonToWidget();
    }

    window.addEventListener('message', onMessage);
    const retryTimers = [400, 1200, 2500].map((ms) => window.setTimeout(pushJsonToWidget, ms));
    return () => {
      window.removeEventListener('message', onMessage);
      retryTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [open, collection.name, pushJsonToWidget]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !collection) return null;

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
        <header className="pipeline-modal__header">
          <div>
            <h2 id={titleId}>{collection.name}</h2>
            <p className="pipeline-modal__subtitle">JSON Crack · collection plan</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close JSON Crack dialog">
            ✕
          </button>
        </header>

        <div className="jsoncrack-collection-modal__frame-wrap">
          <iframe
            ref={iframeRef}
            id={JSON_CRACK_IFRAME_ID}
            key={collection.name}
            className="jsoncrack-collection-modal__frame"
            src={JSON_CRACK_WIDGET_URL}
            title={`JSON Crack graph for ${collection.name}`}
            onLoad={pushJsonToWidget}
          />
        </div>
      </div>
    </div>
  );
}
