import { MongoAnalyzeAggregateTable } from './MongoAnalyzeTables';

type AggregateToolExecutionResultsProps = {
  database: string;
  collection: string;
  data: unknown;
  summary?: string;
  /** When true, render only summary + table (parent already wraps a tool card). */
  embedded?: boolean;
};

/** Aggregate inspect results — same layout in chat tool cards and Query Translator. */
export function AggregateToolExecutionResults({
  database,
  collection,
  data,
  summary,
  embedded = false,
}: AggregateToolExecutionResultsProps) {
  const table = (
    <MongoAnalyzeAggregateTable database={database} collection={collection} data={data} variant="inline" />
  );

  if (embedded) {
    return table;
  }

  return (
    <div className="copilot-tool-card copilot-tool-card--ok copilot-translator-run-results">
      <header className="copilot-tool-card__header">
        <span className="copilot-tool-card__badge">Tool Executed</span>
        <strong>Aggregate</strong>
      </header>
      {summary ? <p className="copilot-tool-card__summary">{summary}</p> : null}
      {table}
    </div>
  );
}
