import type { ToolExecutionResult } from '../../copilot/types';
import { toolDisplayName } from '../../copilot/agentTools';
import {
  readMongoInspectCollectionRows,
  readMongoInspectDatabaseRows,
} from '../../copilot/mongoInspectFormat';
import { MongoInspectCollectionTable, MongoInspectDatabaseTable } from './MongoInspectTable';
import {
  MongoAnalyzeAggregateTable,
  MongoAnalyzeCompareTable,
  MongoAnalyzeExplainTable,
} from './MongoAnalyzeTables';

type ToolExecutionCardProps = {
  execution: ToolExecutionResult;
};

/** Structured card showing an agent tool run and its canvas delta. */
export function ToolExecutionCard({ execution }: ToolExecutionCardProps) {
  const databaseRows =
    execution.tool === 'listMongoDatabases' ? readMongoInspectDatabaseRows(execution.data) : [];
  const collectionSummary =
    execution.tool === 'listMongoCollections' ? readMongoInspectCollectionRows(execution.data) : null;

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
      {execution.tool === 'aggregateMongoCollection' && execution.data ? (
        <MongoAnalyzeAggregateTable
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
      {databaseRows.length === 0 && !(collectionSummary && collectionSummary.collections.length > 0) && execution.delta.length > 0 ? (
        <ul className="copilot-tool-card__delta">
          {execution.delta.map((line) => (
            <li key={line}>
              <code>{line}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
