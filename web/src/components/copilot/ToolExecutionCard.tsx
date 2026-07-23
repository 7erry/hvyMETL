import type { ToolExecutionResult } from '../../copilot/types';
import { toolDisplayName } from '../../copilot/agentTools';

type ToolExecutionCardProps = {
  execution: ToolExecutionResult;
};

function inspectDetailLines(execution: ToolExecutionResult): string[] {
  if (!execution.data || typeof execution.data !== 'object') return [];
  const record = execution.data as Record<string, unknown>;

  if (execution.tool === 'listMongoDatabases' && Array.isArray(record.databases)) {
    return record.databases
      .filter(
        (entry): entry is { name: string } =>
          Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
      )
      .map((entry) => entry.name);
  }

  if (execution.tool === 'listMongoCollections' && Array.isArray(record.collections)) {
    const database = typeof record.database === 'string' ? record.database : 'database';
    return record.collections
      .filter(
        (entry): entry is { name: string } =>
          Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
      )
      .map((entry) => `${database}.${entry.name}`);
  }

  return [];
}

/** Structured card showing an agent tool run and its canvas delta. */
export function ToolExecutionCard({ execution }: ToolExecutionCardProps) {
  const inspectLines = inspectDetailLines(execution);

  return (
    <div className={`copilot-tool-card copilot-tool-card--${execution.ok ? 'ok' : 'error'}`}>
      <header className="copilot-tool-card__header">
        <span className="copilot-tool-card__badge">Tool Executed</span>
        <strong>{toolDisplayName(execution.tool)}</strong>
      </header>
      <p className="copilot-tool-card__summary">{execution.summary}</p>
      {inspectLines.length > 0 ? (
        <ul className="copilot-tool-card__delta">
          {inspectLines.map((line) => (
            <li key={line}>
              <code>{line}</code>
            </li>
          ))}
        </ul>
      ) : execution.delta.length > 0 ? (
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
