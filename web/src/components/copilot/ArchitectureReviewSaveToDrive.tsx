import { useCallback, useEffect, useState } from 'react';
import { fetchCopilotStatus } from '../../api';
import {
  architectureReviewDocTitle,
  architectureReviewToHtml,
  downloadArchitectureReviewMarkdown,
} from '../../copilot/architectureReviewHtml';
import {
  loadGoogleIdentityScript,
  openGoogleDoc,
  uploadArchitectureReviewToGoogleDocs,
} from '../../copilot/googleDriveExport';

type ArchitectureReviewSaveToDriveProps = {
  content: string;
};

/** Exports an architecture review to Google Docs via Drive API (replaces broken Save to Drive widget). */
export function ArchitectureReviewSaveToDrive({ content }: ArchitectureReviewSaveToDriveProps) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchCopilotStatus()
      .then((status) => {
        if (!cancelled) {
          setGoogleClientId(status.googleDrive?.clientId ?? null);
          setStatusLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveToGoogleDocs = useCallback(async () => {
    if (!googleClientId) {
      setError('Google Docs export is not configured. Download the markdown file instead.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await loadGoogleIdentityScript();
      const result = await uploadArchitectureReviewToGoogleDocs({
        clientId: googleClientId,
        title: architectureReviewDocTitle(content),
        html: architectureReviewToHtml(content),
      });
      openGoogleDoc(result);
      setSuccess('Saved to Google Docs.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [content, googleClientId]);

  const handleDownload = useCallback(() => {
    setError('');
    downloadArchitectureReviewMarkdown(content);
  }, [content]);

  return (
    <div className="copilot-save-to-drive">
      <span className="copilot-save-to-drive__label">Export</span>
      <div className="copilot-save-to-drive__actions">
        <button
          type="button"
          className="primary copilot-save-to-drive__btn"
          disabled={busy || !statusLoaded || !googleClientId}
          onClick={() => void handleSaveToGoogleDocs()}
          title={
            googleClientId
              ? 'Create a Google Doc in your Drive'
              : 'Set GOOGLE_DRIVE_CLIENT_ID on the server to enable Google Docs export'
          }
        >
          {busy ? 'Saving…' : 'Save to Google Docs'}
        </button>
        <button type="button" className="secondary copilot-save-to-drive__btn" disabled={busy} onClick={handleDownload}>
          Download markdown
        </button>
      </div>
      {!googleClientId && statusLoaded ? (
        <p className="copilot-save-to-drive__hint">
          Google Docs export requires <code>GOOGLE_DRIVE_CLIENT_ID</code> in the server environment.
        </p>
      ) : null}
      {success ? <p className="copilot-save-to-drive__success">{success}</p> : null}
      {error ? <p className="copilot-save-to-drive__error">{error}</p> : null}
    </div>
  );
}
