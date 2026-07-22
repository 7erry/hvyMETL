import type { AgentStatus } from '../../copilot/types';

type CopilotTypingIndicatorProps = {
  status: AgentStatus;
};

const STATUS_HINT: Record<Exclude<AgentStatus, 'idle'>, string> = {
  analyzing: 'Analyzing schema…',
  mutating: 'Generating response…',
};

/** Pulsing dots + shimmer skeleton shown while the agent awaits an LLM or tool response. */
export function CopilotTypingIndicator({ status }: CopilotTypingIndicatorProps) {
  if (status === 'idle') return null;

  const hint = STATUS_HINT[status];

  return (
    <article
      className="copilot-message copilot-message--agent copilot-message--pending"
      aria-live="polite"
      aria-busy="true"
      aria-label={hint}
    >
      <div className="copilot-typing">
        <div className="copilot-typing__skeleton" aria-hidden="true">
          <span className="copilot-typing__line copilot-typing__line--lg" />
          <span className="copilot-typing__line copilot-typing__line--md" />
          <span className="copilot-typing__line copilot-typing__line--sm" />
        </div>
        <div className="copilot-typing__footer">
          <span className="copilot-typing__dots" aria-hidden="true">
            <span className="copilot-typing__dot" />
            <span className="copilot-typing__dot" />
            <span className="copilot-typing__dot" />
          </span>
          <span className="copilot-typing__hint">{hint}</span>
        </div>
      </div>
    </article>
  );
}
