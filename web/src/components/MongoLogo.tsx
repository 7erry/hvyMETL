import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { fetchApiHealth } from '../api';
import { copilotMarkdownSanitizeSchema } from '../copilot/copilotMarkdownSanitize';
import { MongoLogoLeaf } from './MongoLogoLeaf';

const LOGO_VIDEO_SRC = '/hvyMETL.mp4';
const ARCHITECTURE_DIAGRAM_HREF = '/architecture?theme=dark';
const TRIPLE_CLICK_WINDOW_MS = 500;

/**
 * Official MongoDB logo mark (LeafyGreen @leafygreen-ui/logo MongoDBLogoMark)
 * + hvyMETL wordmark. See https://www.mongodb.com/company/newsroom/brand-resources
 */
export function MongoLogo() {
  const [videoOpen, setVideoOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseHeading, setReleaseHeading] = useState('hvyMETL');
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [releaseNotesSummary, setReleaseNotesSummary] = useState<string | null>(null);
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const clickTrackerRef = useRef({ count: 0, lastAt: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

  const registerLogoClick = useCallback(() => {
    const now = Date.now();
    const tracker = clickTrackerRef.current;
    if (now - tracker.lastAt > TRIPLE_CLICK_WINDOW_MS) {
      tracker.count = 1;
    } else {
      tracker.count += 1;
    }
    tracker.lastAt = now;
    if (tracker.count >= 3) {
      tracker.count = 0;
      setVideoOpen(true);
    }
  }, []);

  const openReleaseDialog = useCallback(() => {
    setReleaseOpen(true);
    setReleaseLoading(true);
    setReleaseError(null);
    void fetchApiHealth()
      .then((health) => {
        setReleaseVersion(health.version);
        setReleaseHeading(health.releaseHeading ?? `hvyMETL ${health.version}`);
        setReleaseNotes(health.releaseNotes ?? null);
        setReleaseNotesSummary(health.releaseNotesSummary ?? health.releaseNotes ?? null);
      })
      .catch(() => {
        setReleaseError('Could not load release notes. Confirm the hvyMETL API is running.');
      })
      .finally(() => {
        setReleaseLoading(false);
      });
  }, []);

  const onLeafDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      clickTrackerRef.current.count = 0;
      openReleaseDialog();
    },
    [openReleaseDialog],
  );

  const launchLogoAnimation = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setReleaseOpen(false);
    setVideoOpen(true);
  }, []);

  useEffect(() => {
    if (!videoOpen) return;
    const video = videoRef.current;
    void video?.play().catch(() => undefined);
  }, [videoOpen]);

  useEffect(() => {
    if (!videoOpen && !releaseOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVideoOpen(false);
        setReleaseOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoOpen, releaseOpen]);

  return (
    <>
      <div className="app-logo" aria-label="hvyMETL — SQL to MongoDB Migration Studio">
        <MongoLogoLeaf
          className="app-logo__leaf app-logo__trigger app-logo__leaf--interactive"
          onDoubleClick={onLeafDoubleClick}
          onClick={registerLogoClick}
          aria-label="MongoDB — double-click for release notes"
          role="img"
        />
        <div className="app-logo__text">
          <div className="app-logo__title-row">
            <div className="app-logo__title app-logo__trigger" onClick={registerLogoClick}>
              hvyMETL
            </div>
            <a
              className="app-logo__architecture"
              href={ARCHITECTURE_DIAGRAM_HREF}
              target="_blank"
              rel="noreferrer"
              aria-label="Architecture diagram"
            >
              <img src="/studio-architecture-icon.png" alt="" />
            </a>
          </div>
          <div className="app-logo__tagline">SQL to MongoDB Migration Studio</div>
        </div>
      </div>
      {releaseOpen
        ? createPortal(
            <div
              className="pipeline-overlay app-logo-release-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-logo-release-title"
              onClick={() => setReleaseOpen(false)}
            >
              <div className="pipeline-modal panel app-logo-release-modal" onClick={(event) => event.stopPropagation()}>
                <header className="pipeline-modal__header">
                  <div className="app-logo-release-modal__brand">
                    <MongoLogoLeaf
                      className="app-logo-release-modal__leaf app-logo-release-modal__leaf--interactive app-logo__leaf--interactive"
                      onDoubleClick={launchLogoAnimation}
                      aria-label="Double-click for hvyMETL animation"
                      role="img"
                    />
                    <div>
                      <h2 id="app-logo-release-title">{releaseHeading}</h2>
                      {releaseVersion ? (
                        <p className="pipeline-modal__subtitle">
                          Version {releaseVersion}
                          {releaseNotesSummary ? ' · full major-version highlights below' : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setReleaseOpen(false)}
                    aria-label="Close release notes dialog"
                  >
                    ✕
                  </button>
                </header>
                <div className="pipeline-modal__body app-logo-release-modal__body">
                  {releaseLoading ? <p className="manager-hint">Loading release notes…</p> : null}
                  {releaseError ? <p className="app-logo-release-modal__error">{releaseError}</p> : null}
                  {!releaseLoading && releaseNotesSummary ? (
                    <div className="app-logo-release-modal__markdown copilot-message__body copilot-message__body--markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, copilotMarkdownSanitizeSchema]]}
                      >
                        {releaseNotesSummary}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                  {!releaseLoading && !releaseError && !releaseNotesSummary ? (
                    <p className="manager-hint">No release notes available for this build.</p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {videoOpen
        ? createPortal(
            <div
              className="app-logo-video-overlay"
              role="presentation"
              onClick={() => setVideoOpen(false)}
            >
              <video
                ref={videoRef}
                className="app-logo-video-overlay__player"
                src={LOGO_VIDEO_SRC}
                playsInline
                controls
                autoPlay
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
