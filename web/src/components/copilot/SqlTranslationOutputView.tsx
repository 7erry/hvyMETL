import { useEffect, useState } from 'react';
import { CopyButton } from '../CopyButton';
import type { SqlTranslationOutput, ToolExecutionResult } from '../../copilot/types';
import { countSqlTranslationLines } from '../../copilot/toolExecutionDisplay';
import { MongoAnalyzeAggregateTable } from './MongoAnalyzeTables';

type TranslatorTab = 'pipeline' | 'mongoose' | 'shell';

type SqlTranslationOutputViewProps = {
  output: SqlTranslationOutput;
  /** When true, show a hint pointing to the Query Translator sidebar tab. */
  showTranslatorTabHint?: boolean;
  /** Panel fills the translator split; inline wraps output in a collapsible details block. */
  layout?: 'panel' | 'inline';
  /** Runs the aggregation pipeline against Atlas via copilot inspect. */
  onRunPipeline?: (output: SqlTranslationOutput) => Promise<ToolExecutionResult>;
  /** When false, Run Code is disabled (Atlas inspect offline). */
  mongoInspectAvailable?: boolean;
};

/** Renders aggregation pipeline, Mongoose, and shell output from SQL translation. */
export function SqlTranslationOutputView({
  output,
  showTranslatorTabHint = false,
  layout = 'inline',
  onRunPipeline,
  mongoInspectAvailable = false,
}: SqlTranslationOutputViewProps) {
  const [activeTab, setActiveTab] = useState<TranslatorTab>('pipeline');
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResult, setRunResult] = useState<ToolExecutionResult | null>(null);
  const lineCount = countSqlTranslationLines(output);

  useEffect(() => {
    setRunBusy(false);
    setRunError('');
    setRunResult(null);
  }, [output]);

  const code =
    activeTab === 'pipeline'
      ? output.aggregationPipeline
      : activeTab === 'mongoose'
        ? output.mongooseScript
        : output.shellScript;

  const canRunPipeline = activeTab === 'pipeline' && Boolean(onRunPipeline) && mongoInspectAvailable;

  const handleRunPipeline = () => {
    if (!onRunPipeline || !canRunPipeline || runBusy) return;
    setRunBusy(true);
    setRunError('');
    void onRunPipeline(output)
      .then((result) => {
        if (!result.ok) {
          setRunError(result.summary);
          setRunResult(null);
          return;
        }
        setRunResult(result);
      })
      .catch((error: unknown) => {
        setRunError(error instanceof Error ? error.message : String(error));
        setRunResult(null);
      })
      .finally(() => setRunBusy(false));
  };

  const body = (
    <>
      {showTranslatorTabHint ? (
        <p className="copilot-sql-translation__hint">
          Also available in the copilot <strong>Query Translator</strong> tab for editing and re-translating.
        </p>
      ) : null}
      <div className="copilot-translator__tabs" role="tablist">
        {(['pipeline', 'mongoose', 'shell'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'pipeline' ? 'Aggregation JSON' : tab === 'mongoose' ? 'Mongoose' : 'Shell'}
          </button>
        ))}
      </div>
      <div
        className={`copilot-translator__code-wrap${layout === 'panel' ? ' copilot-translator__code-wrap--fill' : ''}`}
      >
        <div className="copilot-translator__code-actions">
          <CopyButton text={code} label="Copy Code" />
          {onRunPipeline ? (
            <button
              type="button"
              className="secondary copilot-translator__run-btn"
              disabled={!canRunPipeline || runBusy}
              onClick={handleRunPipeline}
              title={
                !mongoInspectAvailable
                  ? 'Atlas inspect is offline — start the MongoDB MCP server to run pipelines'
                  : activeTab !== 'pipeline'
                    ? 'Switch to Aggregation JSON to run against Atlas'
                    : `Run against ${output.collectionName}`
              }
            >
              {runBusy ? 'Running…' : 'Run Code'}
            </button>
          ) : null}
        </div>
        <pre
          className={`copilot-translator__code${layout === 'panel' ? ' copilot-translator__code--fill' : ''}`}
        >
          <code>{code}</code>
        </pre>
      </div>
      {runError ? <p className="copilot-translator__run-error">{runError}</p> : null}
      {runResult?.ok && runResult.data ? (
        <MongoAnalyzeAggregateTable
          database={String((runResult.data as { database?: string }).database ?? '')}
          collection={String((runResult.data as { collection?: string }).collection ?? output.collectionName)}
          data={runResult.data}
        />
      ) : null}
      {output.indexRecommendations.length > 0 ? (
        <div className="copilot-translator__indexes">
          <strong>Index recommendations</strong>
          <ul>
            {output.indexRecommendations.map((idx) => (
              <li key={idx}>
                <code>{idx}</code>
                <CopyButton text={idx} label="Copy" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  if (layout === 'panel') {
    return <div className="copilot-sql-translation copilot-sql-translation--panel">{body}</div>;
  }

  return (
    <details className="copilot-details copilot-sql-translation">
      <summary className="copilot-details__summary">
        View translated pipeline ({lineCount} line{lineCount === 1 ? '' : 's'})
      </summary>
      {body}
    </details>
  );
}
