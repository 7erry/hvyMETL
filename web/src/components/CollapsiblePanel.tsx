import type { ReactNode } from 'react';
import { useState } from 'react';

type CollapsiblePanelProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

/** Uniform sidebar disclosure panel with the same arrow affordance as canvas table lists. */
export function CollapsiblePanel({
  title,
  children,
  defaultOpen = false,
  className = '',
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className={`panel panel-dropdown${className ? ` ${className}` : ''}`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="panel-dropdown__summary">{title}</summary>
      <div className="panel-dropdown__body">{children}</div>
    </details>
  );
}
