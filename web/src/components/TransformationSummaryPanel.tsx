import type { TransformationSummary } from '../transformationSummaryTypes';

type TransformationSummaryPanelProps = {
  summary: TransformationSummary | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  framed?: boolean;
};

export function TransformationSummaryPanel({
  summary,
  onRefresh,
  refreshing,
  framed = true,
}: TransformationSummaryPanelProps) {
  if (!summary) {
    const empty = (
      <>
        {framed ? <h3>Transformation summary</h3> : null}
        <p className="pipeline-hint">Run design to see why patterns and embeds were or were not applied.</p>
      </>
    );
    return framed ? (
      <div className="panel transformation-summary" style={{ marginBottom: '0.75rem' }}>
        {empty}
      </div>
    ) : (
      <div className="transformation-summary">{empty}</div>
    );
  }

  const content = (
    <>
      <div className="transformation-summary__header">
        {framed ? <h3>Transformation summary</h3> : null}
        {onRefresh ? (
          <button type="button" className="tertiary" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Updating…' : 'Refresh summary'}
          </button>
        ) : null}
      </div>
      <p className="transformation-summary__headline">{summary.headline}</p>
      <p className="transformation-summary__meta">
        Profile <strong>{summary.profileLabel}</strong> ({summary.readWriteRatio}) · row stats:{' '}
        {summary.hasRowStats ? 'yes' : 'no'}
        {summary.csvEnriched ? ' · CSV-enriched' : ''}
      </p>
      <ul className="transformation-insights">
        {summary.insights.map((insight) => (
          <li key={insight.title} className={`transformation-insight transformation-insight--${insight.severity}`}>
            <strong>{insight.title}</strong>
            <p>{insight.body}</p>
          </li>
        ))}
      </ul>
      <details className="transformation-collections">
        <summary>Per collection ({summary.collections.length})</summary>
        <ul>
          {summary.collections.map((collection) => (
            <li key={collection.name}>
              <strong>{collection.name}</strong>
              <span className="transformation-collections__patterns">
                {collection.patterns.length ? collection.patterns.join(', ') : 'schema-versioning only'}
              </span>
              {collection.embeddedFields.length > 0 ? (
                <span className="transformation-collections__embeds">embeds: {collection.embeddedFields.join(', ')}</span>
              ) : null}
              {collection.notes.length > 0 ? (
                <ul className="transformation-collections__notes">
                  {collection.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </>
  );

  return framed ? (
    <div className="panel transformation-summary" style={{ marginBottom: '0.75rem' }}>
      {content}
    </div>
  ) : (
    <div className="transformation-summary">{content}</div>
  );
}
