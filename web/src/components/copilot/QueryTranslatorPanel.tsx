import { useState } from 'react';
import { CopyButton } from '../CopyButton';
import { useCopilot } from '../../copilot/CopilotContext';

type TranslatorTab = 'pipeline' | 'mongoose' | 'shell';

/** SQL → MongoDB query translator drawer tab. */
export function QueryTranslatorPanel() {
  const copilot = useCopilot();
  const [sql, setSql] = useState('');
  const [activeTab, setActiveTab] = useState<TranslatorTab>('pipeline');

  const output = copilot.sqlTranslation;

  const handleTranslate = () => {
    if (!sql.trim()) return;
    copilot.translateSql(sql);
  };

  const code =
    activeTab === 'pipeline'
      ? output?.aggregationPipeline ?? ''
      : activeTab === 'mongoose'
        ? output?.mongooseScript ?? ''
        : output?.shellScript ?? '';

  return (
    <div className="copilot-translator">
      <label className="copilot-translator__label" htmlFor="copilot-sql-input">
        Paste T-SQL / PostgreSQL
      </label>
      <textarea
        id="copilot-sql-input"
        className="copilot-translator__input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT t.id, s.name FROM trips t JOIN trip_stops s ON ..."
        rows={6}
        spellCheck={false}
      />
      <div className="button-row">
        <button type="button" className="primary" onClick={handleTranslate}>
          Translate
        </button>
      </div>

      {output ? (
        <>
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
          <div className="copilot-translator__code-wrap">
            <CopyButton text={code} label="Copy Code" />
            <pre className="copilot-translator__code">
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
                    <button
                      type="button"
                      className="secondary copilot-translator__apply-index"
                      onClick={() => {
                        void navigator.clipboard.writeText(idx);
                      }}
                      title="Copy index definition for your migration plan"
                    >
                      Apply Index Recommendation
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
