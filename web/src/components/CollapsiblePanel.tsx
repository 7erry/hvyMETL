import type { ReactNode, SyntheticEvent } from 'react';
import { useState } from 'react';

type CollapsiblePanelProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Element id for scroll targets and cross-panel navigation. */
  id?: string;
  /** Controlled open state; omit for uncontrolled behavior. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  id,
  open,
  onOpenChange,
  collapsedHint,
  headerActions,
}: CollapsiblePanelProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    if (open === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <details
      id={id}
      className={`panel panel-dropdown${className ? ` ${className}` : ''}`}
      open={isOpen}
      onToggle={handleToggle}
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
