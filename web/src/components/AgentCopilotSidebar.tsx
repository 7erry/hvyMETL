import { useEffect, useMemo, useRef, useState } from 'react';
import { useCopilot } from '../copilot/CopilotContext';
import { COPILOT_SLASH_COMMANDS, QUICK_ACTION_CHIPS, type AgentStatus } from '../copilot/types';
import { ToolExecutionCard } from './copilot/ToolExecutionCard';
import { QueryTranslatorPanel } from './copilot/QueryTranslatorPanel';
import { SchemaDiffViewer } from './copilot/SchemaDiffViewer';
import { CopilotMessageBody } from './copilot/CopilotMessageBody';
import { CopilotTypingIndicator } from './copilot/CopilotTypingIndicator';

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  analyzing: 'Analyzing Schema',
  mutating: 'Mutating Canvas',
};

const PRESET_LABEL = {
  'schema-design': 'Schema Design',
  guardrails: 'Guardrails',
  'query-translate': 'Query Translate',
  'self-heal': 'Self-Heal',
} as const;

type AgentCopilotSidebarProps = {
  beforeJson?: string;
  afterJson?: string;
};

/** Collapsible right-hand agent copilot drawer. */
export function AgentCopilotSidebar({ beforeJson = '', afterJson = '' }: AgentCopilotSidebarProps) {
  const copilot = useCopilot();
  const [input, setInput] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const slashSuggestions = useMemo(() => {
    if (!input.startsWith('/')) return [];
    return COPILOT_SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(input.split(/\s/)[0] ?? ''));
  }, [input]);

  const isWaiting = copilot.status !== 'idle';

  useEffect(() => {
    if (!isWaiting) return;
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [isWaiting, copilot.messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    copilot.sendMessage(input);
    setInput('');
    setShowSlashMenu(false);
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  if (!copilot.open) {
    return (
      <button
        type="button"
        className="agent-copilot-launcher"
        onClick={() => copilot.setOpen(true)}
        aria-label="Open Agent Copilot"
        title="Agent Copilot (⌘K)"
      >
        ◈ Agent
      </button>
    );
  }

  return (
    <aside
      className="agent-copilot-sidebar"
      style={{ width: copilot.width }}
      aria-label="Agent Copilot"
    >
      <header className="agent-copilot-sidebar__header">
        <div className="agent-copilot-sidebar__title-row">
          <span className={`agent-copilot-sidebar__status agent-copilot-sidebar__status--${copilot.status}`} />
          <div>
            <h2>Agent Copilot</h2>
            <p className="agent-copilot-sidebar__meta">
              {STATUS_LABEL[copilot.status]} · {PRESET_LABEL[copilot.preset]}
              {copilot.llmConfigured && copilot.llmModel ? (
                <> · {copilot.llmModel}</>
              ) : (
                <> · offline heuristics</>
              )}
              {!copilot.mongoInspectAvailable ? <> · Atlas inspect offline</> : null}
            </p>
            {!copilot.mongoInspectAvailable && copilot.mongoInspectMessage ? (
              <p className="agent-copilot-sidebar__meta agent-copilot-sidebar__meta--warn">
                {copilot.mongoInspectMessage}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={() => copilot.setOpen(false)}
          aria-label="Collapse copilot"
          title="Close copilot"
        >
          ›
        </button>
      </header>

      <div className="agent-copilot-sidebar__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={copilot.activeTab === 'chat'}
          className={copilot.activeTab === 'chat' ? 'active' : ''}
          onClick={() => copilot.setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={copilot.activeTab === 'translator'}
          className={copilot.activeTab === 'translator' ? 'active' : ''}
          onClick={() => copilot.setActiveTab('translator')}
        >
          Query Translator
        </button>
      </div>

      {copilot.activeTab === 'translator' ? (
        <div className="agent-copilot-sidebar__body">
          <QueryTranslatorPanel />
        </div>
      ) : (
        <>
          <div className="agent-copilot-sidebar__thread" ref={threadRef}>
            {copilot.messages.length === 0 ? (
              <p className="agent-copilot-sidebar__empty">
                Ask about embeds, run <code>/guardrails</code>, or use quick actions below.{' '}
                <kbd>⌘K</kbd> toggles this panel.
              </p>
            ) : null}
            {copilot.messages.map((message) => (
              <article
                key={message.id}
                className={`copilot-message copilot-message--${message.role}`}
              >
                {message.toolExecution ? <ToolExecutionCard execution={message.toolExecution} /> : null}
                <CopilotMessageBody content={message.content} markdown={message.markdown} />
              </article>
            ))}

            <CopilotTypingIndicator status={copilot.status} />

            {copilot.pipelineError ? (
              <div className="copilot-self-heal">
                <p className="copilot-self-heal__error">{copilot.selfHealSuggestion}</p>
                <div className="button-row">
                  <button type="button" className="primary" onClick={copilot.applySelfHeal}>
                    Apply Fix &amp; Re-run
                  </button>
                  <button type="button" className="secondary" onClick={copilot.clearPipelineError}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            {beforeJson && afterJson ? (
              <SchemaDiffViewer beforeJson={beforeJson} afterJson={afterJson} />
            ) : null}
          </div>

          <footer className="agent-copilot-sidebar__action-bar">
            <div className="copilot-quick-chips">
              {QUICK_ACTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="copilot-chip"
                  onClick={() => copilot.sendMessage(chip.prompt)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <label className="copilot-tools-toggle">
              <input
                type="checkbox"
                checked={copilot.toolsEnabled}
                onChange={(e) => copilot.setToolsEnabled(e.target.checked)}
              />
              Enable tool calls
            </label>
            <div className="copilot-input-row">
              <textarea
                className="copilot-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setShowSlashMenu(e.target.value.startsWith('/'));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message agent… (/fold, /guardrails, /translate)"
                rows={2}
              />
              <button type="button" className="primary" onClick={handleSend} disabled={isWaiting} aria-label="Send message">
                Send
              </button>
            </div>
            {showSlashMenu && slashSuggestions.length > 0 ? (
              <ul className="copilot-slash-menu">
                {slashSuggestions.map((item) => (
                  <li key={item.command}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(`${item.command} `);
                        setShowSlashMenu(false);
                      }}
                    >
                      <code>{item.command}</code>
                      <span>{item.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </footer>
        </>
      )}
    </aside>
  );
}
