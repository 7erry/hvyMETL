import type { ReactNode, SyntheticEvent } from 'react';
import { useState } from 'react';

type CollapsiblePanelProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Brief value shown on the right when the panel is collapsed. */
  collapsedHint?: string;
  /** Optional controls shown on the summary row (clicks do not toggle the panel). */
  headerActions?: ReactNode;
};

function stopSummaryToggle(event: SyntheticEvent) {
  event.stopPropagation();
}

/** Uniform sidebar disclosure panel with the same arrow affordance as canvas table lists. */
export function CollapsiblePanel({
  title,
  children,
  defaultOpen = false,
  className = '',
  collapsedHint,
  headerActions,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className={`panel panel-dropdown${className ? ` ${className}` : ''}`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="panel-dropdown__summary">
        <span className="panel-dropdown__title">{title}</span>
        {!isOpen && collapsedHint ? (
          <span className="panel-dropdown__hint">{collapsedHint}</span>
        ) : null}
        {headerActions ? (
          <span
            className="panel-dropdown__actions"
            onClick={stopSummaryToggle}
            onKeyDown={stopSummaryToggle}
          >
            {headerActions}
          </span>
        ) : null}
      </summary>
      <div className="panel-dropdown__body">{children}</div>
    </details>
  );
}
