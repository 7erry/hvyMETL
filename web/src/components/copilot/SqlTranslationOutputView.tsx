import { useState } from 'react';
import { CopyButton } from '../CopyButton';
import type { SqlTranslationOutput } from '../../copilot/types';
import { countSqlTranslationLines } from '../../copilot/toolExecutionDisplay';

type TranslatorTab = 'pipeline' | 'mongoose' | 'shell';

type SqlTranslationOutputViewProps = {
  output: SqlTranslationOutput;
  /** When true, show a hint pointing to the Query Translator sidebar tab. */
  showTranslatorTabHint?: boolean;
  /** Panel fills the translator split; inline wraps output in a collapsible details block. */
  layout?: 'panel' | 'inline';
};

/** Renders aggregation pipeline, Mongoose, and shell output from SQL translation. */
export function SqlTranslationOutputView({
  output,
  showTranslatorTabHint = false,
  layout = 'inline',
}: SqlTranslationOutputViewProps) {
  const [activeTab, setActiveTab] = useState<TranslatorTab>('pipeline');
  const lineCount = countSqlTranslationLines(output);

  const code =
    activeTab === 'pipeline'
      ? output.aggregationPipeline
      : activeTab === 'mongoose'
        ? output.mongooseScript
        : output.shellScript;

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
        <CopyButton text={code} label="Copy Code" />
        <pre
          className={`copilot-translator__code${layout === 'panel' ? ' copilot-translator__code--fill' : ''}`}
        >
          <code>{code}</code>
        </pre>
      </div>
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
