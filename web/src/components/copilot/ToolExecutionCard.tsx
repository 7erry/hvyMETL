import type { ToolExecutionResult } from '../../copilot/types';
import { toolDisplayName } from '../../copilot/agentTools';
import { useCopilot } from '../../copilot/CopilotContext';
import {
  readMongoInspectCollectionRows,
  readMongoInspectDatabaseRows,
  readMongoInspectIndexRows,
  readMongoInspectSchemaSummary,
} from '../../copilot/mongoInspectFormat';
import { resolveSqlTranslationOutput, toolExecutionHasStructuredOutput } from '../../copilot/toolExecutionDisplay';
import {
  MongoInspectCollectionTable,
  MongoInspectDatabaseTable,
  MongoInspectFindTable,
  MongoInspectIndexTable,
  MongoInspectSchemaTable,
} from './MongoInspectTable';
import { CopilotCollapsibleResults } from './CopilotCollapsibleResults';
import {
  MongoAnalyzeCompareTable,
  MongoAnalyzeExplainTable,
} from './MongoAnalyzeTables';
import { AggregateToolExecutionResults } from './AggregateToolExecutionResults';
import { SqlTranslationOutputView } from './SqlTranslationOutputView';

type ToolExecutionCardProps = {
  execution: ToolExecutionResult;
};

/** Structured card showing an agent tool run and its canvas delta. */
export function ToolExecutionCard({ execution }: ToolExecutionCardProps) {
  const copilot = useCopilot();
  const databaseRows =
    execution.tool === 'listMongoDatabases' ? readMongoInspectDatabaseRows(execution.data) : [];
  const collectionSummary =
    execution.tool === 'listMongoCollections' ? readMongoInspectCollectionRows(execution.data) : null;
  const indexSummary =
    execution.tool === 'listMongoCollectionIndexes' ? readMongoInspectIndexRows(execution.data) : null;
  const schemaSummary =
    execution.tool === 'describeMongoCollectionSchema' ? readMongoInspectSchemaSummary(execution.data) : null;
  const sqlTranslation = resolveSqlTranslationOutput(execution, copilot.sqlTranslation);
  const hasStructuredOutput =
    toolExecutionHasStructuredOutput(execution) ||
    Boolean(sqlTranslation) ||
    databaseRows.length > 0 ||
    Boolean(collectionSummary && collectionSummary.collections.length > 0) ||
    Boolean(schemaSummary && schemaSummary.fields.length > 0) ||
    execution.tool === 'findMongoDocuments';

  return (
    <div className={`copilot-tool-card copilot-tool-card--${execution.ok ? 'ok' : 'error'}`}>
      <header className="copilot-tool-card__header">
        <span className="copilot-tool-card__badge">Tool Executed</span>
        <strong>{toolDisplayName(execution.tool)}</strong>
      </header>
      <p className="copilot-tool-card__summary">{execution.summary}</p>
      {databaseRows.length > 0 ? <MongoInspectDatabaseTable databases={databaseRows} /> : null}
      {collectionSummary && collectionSummary.collections.length > 0 ? (
        <MongoInspectCollectionTable
          database={collectionSummary.database}
          collections={collectionSummary.collections}
        />
      ) : null}
      {indexSummary ? <MongoInspectIndexTable summary={indexSummary} /> : null}
      {schemaSummary ? <MongoInspectSchemaTable summary={schemaSummary} /> : null}
      {execution.tool === 'findMongoDocuments' && execution.data ? (
        <MongoInspectFindTable data={execution.data} />
      ) : null}
      {execution.tool === 'aggregateMongoCollection' && execution.data ? (
        <AggregateToolExecutionResults
          embedded
          database={String((execution.data as { database?: string }).database ?? '')}
          collection={String((execution.data as { collection?: string }).collection ?? '')}
          data={execution.data}
        />
      ) : null}
      {execution.tool === 'explainMongoOperation' && execution.data ? (
        <MongoAnalyzeExplainTable data={execution.data} />
      ) : null}
      {execution.tool === 'compareMongoCollectionToPlan' && execution.data ? (
        <MongoAnalyzeCompareTable data={execution.data} />
      ) : null}
      {sqlTranslation ? (
        <SqlTranslationOutputView
          output={sqlTranslation}
          showTranslatorTabHint
          onRunPipeline={copilot.runSqlTranslationPipeline}
          mongoInspectAvailable={copilot.mongoInspectAvailable}
        />
      ) : null}
      {execution.nextStep ? (
        <div className="copilot-tool-card__next-step">
          <span className="copilot-tool-card__next-step-label">Next step</span>
          <button
            type="button"
            className="primary copilot-tool-card__next-step-btn"
            disabled={copilot.status !== 'idle'}
            onClick={() => copilot.runNextStep(execution.nextStep!)}
          >
            {execution.nextStep.label}
          </button>
        </div>
      ) : null}
      {!hasStructuredOutput && execution.delta.length > 0 ? (
        <CopilotCollapsibleResults
          summary={`Details — ${execution.delta.length.toLocaleString()} item${execution.delta.length === 1 ? '' : 's'}`}
        >
          <ul className="copilot-tool-card__delta">
            {execution.delta.map((line) => (
              <li key={line}>
                <code>{line}</code>
              </li>
            ))}
          </ul>
        </CopilotCollapsibleResults>
      ) : null}
    </div>
  );
}
