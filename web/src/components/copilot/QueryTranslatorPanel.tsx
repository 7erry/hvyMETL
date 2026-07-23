import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopilot } from '../../copilot/CopilotContext';
import { ResizableVerticalSplit } from '../ResizableVerticalSplit';
import { SqlTranslationOutputView } from './SqlTranslationOutputView';

const MIN_OUTPUT_PANEL_HEIGHT = 120;
const MIN_INPUT_PANEL_HEIGHT = 140;

/** SQL → MongoDB query translator drawer tab. */
export function QueryTranslatorPanel() {
  const copilot = useCopilot();
  const [sql, setSql] = useState('');
  const [outputPanelHeight, setOutputPanelHeight] = useState(280);
  const containerRef = useRef<HTMLDivElement>(null);
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);
  const output = copilot.sqlTranslation;

  const syncOutputHeight = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const available = container.clientHeight;
    if (available <= 0) return;
    setOutputPanelHeight((current) => {
      const maxBottom = Math.max(MIN_OUTPUT_PANEL_HEIGHT, available - MIN_INPUT_PANEL_HEIGHT);
      return Math.min(maxBottom, Math.max(MIN_OUTPUT_PANEL_HEIGHT, current));
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      syncOutputHeight();
    });
    observer.observe(container);
    syncOutputHeight();

    return () => observer.disconnect();
  }, [syncOutputHeight]);

  useEffect(() => {
    if (output) {
      syncOutputHeight();
    }
  }, [output, syncOutputHeight]);

  useEffect(() => {
    const focus = () => sqlInputRef.current?.focus({ preventScroll: true });
    focus();
    const timerIds = [0, 50, 150].map((delayMs) => window.setTimeout(focus, delayMs));
    return () => timerIds.forEach((timerId) => window.clearTimeout(timerId));
  }, []);

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
        onBottomHeightChange={setOutputPanelHeight}
        minBottom={MIN_OUTPUT_PANEL_HEIGHT}
        minTop={MIN_INPUT_PANEL_HEIGHT}
        top={inputPane}
        bottom={
          <div className="copilot-translator__pane copilot-translator__pane--output">
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
