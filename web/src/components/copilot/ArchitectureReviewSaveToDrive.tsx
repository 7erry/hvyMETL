import { useEffect, useRef, useState } from 'react';
import { createArchitectureReviewExport } from '../../api';
import { architectureReviewFilename } from '../../copilot/architectureReviewExport';
import { loadGoogleSaveToDriveScript, renderSaveToDriveButton } from '../../copilot/googleSaveToDrive';

type ArchitectureReviewSaveToDriveProps = {
  content: string;
};

/** Google Save to Drive button for Agent Copilot architecture review responses. */
export function ArchitectureReviewSaveToDrive({ content }: ArchitectureReviewSaveToDriveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError('');

    void (async () => {
      try {
        const exportInfo = await createArchitectureReviewExport({
          content,
          filename: architectureReviewFilename(content),
        });
        if (cancelled) return;

        await loadGoogleSaveToDriveScript();
        if (cancelled) return;

        const src = `${window.location.origin}${exportInfo.downloadPath}`;
        renderSaveToDriveButton(container, {
          src,
          filename: exportInfo.filename,
          sitename: 'hvyMETL',
        });
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [content]);

  return (
    <div className="copilot-save-to-drive">
      <span className="copilot-save-to-drive__label">Export</span>
      {loading && !error ? <span className="copilot-save-to-drive__hint">Preparing Google Drive export…</span> : null}
      <div ref={containerRef} className="copilot-save-to-drive__widget" aria-live="polite" />
      {error ? <p className="copilot-save-to-drive__error">{error}</p> : null}
    </div>
  );
}
