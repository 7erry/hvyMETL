import { useCallback, useEffect, useRef, useState } from 'react';
import { useSizingAssistant } from '../../sizing/SizingAssistantContext';
import { CopilotMessageBody } from '../copilot/CopilotMessageBody';
import { CopilotTypingIndicator } from '../copilot/CopilotTypingIndicator';

const QUICK_PROMPTS = [
  {
    label: 'Sample workload',
    prompt:
      'Size an Atlas cluster: 400 GB data, 4000 read ops/sec, 1500 write ops/sec, 2.5 KB average document, bulk writes allowed.',
  },
  {
    label: 'Missing params',
    prompt: 'What sizing parameters are still missing?',
  },
  {
    label: 'Run sizing',
    prompt: 'Please run find_optimal_cluster_tier with the parameters we have so far.',
  },
];

export function SizingAssistantPanel() {
  const sizing = useSizingAssistant();
  const [input, setInput] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  const isWaiting = sizing.status === 'loading';

  useEffect(() => {
    if (!isWaiting) return;
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [isWaiting, sizing.messages.length]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isWaiting) return;
    void sizing.sendMessage(input);
    setInput('');
  }, [input, isWaiting, sizing]);

  return (
    <div className="agent-copilot-sidebar__body agent-copilot-sidebar__body--sizing">
      <div className="sizing-assistant-banner">
        <strong>Atlas Sizing</strong>
        <span className="sizing-assistant-banner__meta">
          {sizing.configured && sizing.model ? `Grove · ${sizing.model}` : 'Set GROVE_API_KEY for LLM chat'}
        </span>
        <button type="button" className="tertiary sizing-assistant-reset" onClick={() => void sizing.resetSession()}>
          New session
        </button>
      </div>

      <div className="agent-copilot-sidebar__thread" ref={threadRef}>
        {sizing.messages.length === 0 ? (
          <p className="agent-copilot-sidebar__empty">
            Describe cluster workload (data size, peak reads/writes, document size). The sizing assistant collects
            parameters and recommends an Atlas tier — without exposing hourly cost in chat.
          </p>
        ) : null}

        {sizing.messages.map((message) => (
          <article key={message.id} className={`copilot-message copilot-message--${message.role}`}>
            {message.toolResults?.length ? (
              <ul className="sizing-assistant-tool-results">
                {message.toolResults.map((item) => (
                  <li key={`${message.id}-${item.tool}`}>
                    <code>{item.tool}</code> — {item.summary}
                  </li>
                ))}
              </ul>
            ) : null}
            {message.content.trim() ? (
              <CopilotMessageBody content={message.content} markdown={message.markdown} />
            ) : null}
          </article>
        ))}

        <CopilotTypingIndicator status={isWaiting ? 'analyzing' : 'idle'} />
      </div>

      <footer className="agent-copilot-sidebar__action-bar">
        <div className="copilot-quick-chips">
          {QUICK_PROMPTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="copilot-chip"
              disabled={isWaiting}
              onClick={() => void sizing.sendMessage(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="copilot-input-row">
          <textarea
            className="copilot-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe Atlas sizing requirements…"
            rows={2}
            disabled={isWaiting}
          />
          <button type="button" className="primary" onClick={handleSend} disabled={isWaiting} aria-label="Send message">
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
