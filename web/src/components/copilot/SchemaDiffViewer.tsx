import { useCopilot } from '../../copilot/CopilotContext';

type SchemaDiffViewerProps = {
  beforeJson: string;
  afterJson: string;
};

/** Side-by-side Before SQL vs After MongoDB JSON diff toggle. */
export function SchemaDiffViewer({ beforeJson, afterJson }: SchemaDiffViewerProps) {
  const { showDiffPreview, setShowDiffPreview } = useCopilot();

  if (!showDiffPreview) {
    return (
      <button type="button" className="tertiary copilot-diff-toggle" onClick={() => setShowDiffPreview(true)}>
        Show Before / After JSON diff
      </button>
    );
  }

  return (
    <div className="copilot-diff-viewer">
      <header className="copilot-diff-viewer__header">
        <strong>Schema diff preview</strong>
        <button type="button" className="btn-icon" onClick={() => setShowDiffPreview(false)} aria-label="Close diff">
          ✕
        </button>
      </header>
      <div className="copilot-diff-viewer__panes">
        <div>
          <span className="copilot-diff-viewer__label">Before SQL</span>
          <pre>{beforeJson}</pre>
        </div>
        <div>
          <span className="copilot-diff-viewer__label">After MongoDB</span>
          <pre>{afterJson}</pre>
        </div>
      </div>
    </div>
  );
}
