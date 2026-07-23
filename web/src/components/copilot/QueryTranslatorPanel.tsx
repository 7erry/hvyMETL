import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopilot } from '../../copilot/CopilotContext';
import { ResizableVerticalSplit } from '../ResizableVerticalSplit';
import { SqlTranslationOutputView } from './SqlTranslationOutputView';

const MIN_OUTPUT_PANEL_HEIGHT = 120;
const MIN_INPUT_PANEL_HEIGHT = 100;
/** Bottom (results) pane gets this share of the translator body by default. */
const DEFAULT_BOTTOM_RATIO = 0.75;

function computeDefaultBottomHeight(available: number): number {
  const maxBottom = Math.max(MIN_OUTPUT_PANEL_HEIGHT, available - MIN_INPUT_PANEL_HEIGHT);
  const preferred = Math.round(available * DEFAULT_BOTTOM_RATIO);
  return Math.min(maxBottom, Math.max(MIN_OUTPUT_PANEL_HEIGHT, preferred));
}

/** SQL → MongoDB query translator drawer tab. */
export function QueryTranslatorPanel() {
  const copilot = useCopilot();
  const [sql, setSql] = useState('');
  const [outputPanelHeight, setOutputPanelHeight] = useState(MIN_OUTPUT_PANEL_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);
  const outputPaneRef = useRef<HTMLDivElement>(null);
  const userAdjustedSplitRef = useRef(false);
  const output = copilot.sqlTranslation;

  const applyDefaultSplit = useCallback((force = false) => {
    const container = containerRef.current;
    if (!container) return;
    const available = container.clientHeight;
    if (available <= 0) return;
    if (!force && userAdjustedSplitRef.current) return;
    setOutputPanelHeight(computeDefaultBottomHeight(available));
  }, []);

  const handleBottomHeightChange = useCallback((height: number) => {
    userAdjustedSplitRef.current = true;
    setOutputPanelHeight(height);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      applyDefaultSplit();
    });
    observer.observe(container);
    applyDefaultSplit(true);

    return () => observer.disconnect();
  }, [applyDefaultSplit]);

  useEffect(() => {
    if (!output) {
      const focus = () => sqlInputRef.current?.focus({ preventScroll: true });
      focus();
      const timerIds = [0, 50, 150].map((delayMs) => window.setTimeout(focus, delayMs));
      return () => timerIds.forEach((timerId) => window.clearTimeout(timerId));
    }

    applyDefaultSplit(true);
    const focusOutput = () => outputPaneRef.current?.focus({ preventScroll: true });
    focusOutput();
    const timerIds = [0, 50, 150].map((delayMs) => window.setTimeout(focusOutput, delayMs));
    return () => timerIds.forEach((timerId) => window.clearTimeout(timerId));
  }, [output, applyDefaultSplit]);

  const handleTranslate = () => {
    if (!sql.trim()) return;
    copilot.translateSql(sql);
  };

  const inputPane = (
    <div className="copilot-translator__pane copilot-translator__pane--input">
      <label className="copilot-translator__label" htmlFor="copilot-sql-input">
        Paste T-SQL / PostgreSQL / Oracle SQL
      </label>
      <textarea
        ref={sqlInputRef}
        id="copilot-sql-input"
        className="copilot-translator__input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT t.id, s.name FROM trips t JOIN trip_stops s ON ..."
        spellCheck={false}
        rows={3}
      />
      <div className="copilot-translator__actions button-row">
        <button type="button" className="primary" onClick={handleTranslate}>
          Translate
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="copilot-translator copilot-translator--split">
      <ResizableVerticalSplit
        bottomHeight={outputPanelHeight}
        onBottomHeightChange={handleBottomHeightChange}
        minBottom={MIN_OUTPUT_PANEL_HEIGHT}
        minTop={MIN_INPUT_PANEL_HEIGHT}
        top={inputPane}
        bottom={
          <div
            ref={outputPaneRef}
            className="copilot-translator__pane copilot-translator__pane--output"
            tabIndex={-1}
            aria-label="Translation output"
          >
            {output ? (
              <SqlTranslationOutputView output={output} layout="panel" />
            ) : (
              <p className="copilot-translator__placeholder">
                Drag the divider above to resize panels. Translation output appears here after you click Translate.
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
