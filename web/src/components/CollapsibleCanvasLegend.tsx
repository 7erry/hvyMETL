import type { ReactNode } from 'react';
import { useState } from 'react';

type CollapsibleCanvasLegendProps = {
  title?: string;
  collapsedHint: string;
  defaultOpen?: boolean;
  compact?: boolean;
  className?: string;
  children: ReactNode;
};

/** Compact on-canvas legend chip; collapsed by default on narrow viewports. */
export function CollapsibleCanvasLegend({
  title = 'Legend',
  collapsedHint,
  defaultOpen,
  compact = false,
  className = '',
  children,
}: CollapsibleCanvasLegendProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <details
      className={`schema-canvas-legend schema-canvas-legend--collapsible${className ? ` ${className}` : ''}`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="schema-canvas-legend__summary">
        <span className="schema-canvas-legend__title">{title}</span>
        {!isOpen && collapsedHint ? (
          <span className="schema-canvas-legend__hint">{collapsedHint}</span>
        ) : null}
      </summary>
      <div className="schema-canvas-legend__body">{children}</div>
    </details>
  );
}
