import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCopilot } from '../copilot/CopilotContext';
import { MIGRATION_WORKFLOW_GUIDE_PROMPT } from '../copilot/copilotActionLinks';
import { COPILOT_SLASH_COMMANDS, COPILOT_COMMANDS_USER_PROMPT, buildQuickActionChips, type AgentStatus } from '../copilot/types';
import { ToolExecutionCard } from './copilot/ToolExecutionCard';
import { QueryTranslatorPanel } from './copilot/QueryTranslatorPanel';
import { SizingAssistantPanel } from './sizing/SizingAssistantPanel';
import { CopilotMessageBody } from './copilot/CopilotMessageBody';
import { MigrationWorkflowGuide } from './copilot/MigrationWorkflowGuide';
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
  sizing: 'Atlas Sizing',
} as const;

/** Collapsible right-hand agent copilot drawer. */
export function AgentCopilotSidebar() {
  const copilot = useCopilot();
  const { registerChatInputFocus } = copilot;
  const [input, setInput] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const focusChatInput = useCallback(() => {
    const el = chatInputRef.current;
    if (!el || !copilot.open || copilot.activeTab !== 'chat') return;
    el.focus({ preventScroll: true });
  }, [copilot.open, copilot.activeTab]);

  useLayoutEffect(() => {
    registerChatInputFocus(focusChatInput);
    return () => registerChatInputFocus(null);
  }, [registerChatInputFocus, focusChatInput]);

  useEffect(() => {
    if (!copilot.open || copilot.activeTab !== 'chat') return;

    focusChatInput();
    const timerIds = [0, 50, 150, 320].map((delayMs) => window.setTimeout(focusChatInput, delayMs));
    return () => timerIds.forEach((timerId) => window.clearTimeout(timerId));
  }, [copilot.open, copilot.activeTab, copilot.status, focusChatInput]);

  const slashSuggestions = useMemo(() => {
    if (!input.startsWith('/')) return [];
    return COPILOT_SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(input.split(/\s/)[0] ?? ''));
  }, [input]);

  const isWaiting = copilot.status !== 'idle';
  const quickActionChips = useMemo(
    () => buildQuickActionChips(copilot.targetDatabase),
    [copilot.targetDatabase],
  );

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
    focusChatInput();
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const handleOpen = () => {
    copilot.setOpen(true);
  };

  return (
    <>
      {!copilot.open ? (
        <button
          type="button"
          className="agent-copilot-launcher"
          onClick={handleOpen}
          aria-label="Open Agent Copilot"
          title="Agent Copilot (⌘K)"
        >
          ◈ Agent
        </button>
      ) : null}

      <aside
        className="agent-copilot-sidebar"
        style={{ width: copilot.width }}
        aria-label="Agent Copilot"
        aria-hidden={!copilot.open}
        data-open={copilot.open ? 'true' : 'false'}
      >
        <header className="agent-copilot-sidebar__header">
          <div className="agent-copilot-sidebar__title-row">
            <span className={`agent-copilot-sidebar__status agent-copilot-sidebar__status--${copilot.status}`} />
            <div>
              <h2>Agent Copilot</h2>
              <p className="agent-copilot-sidebar__meta">
                {copilot.activeTab === 'sizing'
                  ? 'Atlas cluster sizing'
                  : `${STATUS_LABEL[copilot.status]} · ${PRESET_LABEL[copilot.preset]}`}
                {copilot.llmConfigured && copilot.llmModel ? (
                  <> · {copilot.llmModel}</>
                ) : (
                  <> · offline heuristics</>
                )}
                {!copilot.mongoInspectAvailable ? <> · Atlas inspect disabled</> : null}
              </p>
              {copilot.mongoInspectMessage ? (
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
          <button
            type="button"
            role="tab"
            aria-selected={copilot.activeTab === 'sizing'}
            className={copilot.activeTab === 'sizing' ? 'active' : ''}
            onClick={() => copilot.setActiveTab('sizing')}
          >
            Atlas Sizing
          </button>
        </div>

        {copilot.activeTab === 'translator' ? (
          <div className="agent-copilot-sidebar__body agent-copilot-sidebar__body--translator">
            <QueryTranslatorPanel />
          </div>
        ) : copilot.activeTab === 'sizing' ? (
          <SizingAssistantPanel />
        ) : (
          <>
            <div className="agent-copilot-sidebar__thread" ref={threadRef}>
              {copilot.messages.length === 0 ? (
                <p className="agent-copilot-sidebar__empty">
                  Ask about embeds, run <code>/guardrails</code>, or{' '}
                  <button
                    type="button"
                    className="copilot-action-link copilot-action-link--inline"
                    disabled={isWaiting}
                    onClick={() => copilot.sendMessage(MIGRATION_WORKFLOW_GUIDE_PROMPT)}
                  >
                    guide me through the migration workflow
                  </button>
                  . <kbd>⌘K</kbd> toggles this panel.
                </p>
              ) : null}
              {copilot.messages.map((message) => (
                <article
                  key={message.id}
                  className={`copilot-message copilot-message--${message.role}`}
                >
                  {message.toolExecution ? <ToolExecutionCard execution={message.toolExecution} /> : null}
                  {message.variant === 'workflow-guide' ? (
                    <MigrationWorkflowGuide />
                  ) : message.content.trim() ? (
                    <CopilotMessageBody content={message.content} markdown={message.markdown} />
                  ) : null}
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

            </div>

            <footer className="agent-copilot-sidebar__action-bar">
              <div className="copilot-quick-chips">
                <button
                  type="button"
                  className="copilot-chip"
                  onClick={() => copilot.sendMessage(COPILOT_COMMANDS_USER_PROMPT)}
                >
                  Available Commands
                </button>
                {quickActionChips.map((chip) => (
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
              <div className="copilot-input-row">
                <textarea
                  ref={chatInputRef}
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
                  disabled={!copilot.open}
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
                          focusChatInput();
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
    </>
  );
}
