import type { ToolExecutionResult } from '../../copilot/types';
import { toolDisplayName } from '../../copilot/agentTools';

type ToolExecutionCardProps = {
  execution: ToolExecutionResult;
};

/** Structured card showing an agent tool run and its canvas delta. */
export function ToolExecutionCard({ execution }: ToolExecutionCardProps) {
  return (
    <div className={`copilot-tool-card copilot-tool-card--${execution.ok ? 'ok' : 'error'}`}>
      <header className="copilot-tool-card__header">
        <span className="copilot-tool-card__badge">Tool Executed</span>
        <strong>{toolDisplayName(execution.tool)}</strong>
      </header>
      <p className="copilot-tool-card__summary">{execution.summary}</p>
      {execution.delta.length > 0 ? (
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
