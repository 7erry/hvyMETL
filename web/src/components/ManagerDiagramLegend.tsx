import type { SchemaPhase } from '../sessionState';

type ManagerDiagramLegendProps = {
  phase: SchemaPhase;
};

/** Manager status colors embedded inline in the bottom status bar. */
export function ManagerDiagramLegend({ phase }: ManagerDiagramLegendProps) {
  const phaseLabel = phase === 'before' ? 'Source SQL' : 'Target MongoDB';

  return (
    <div className="footer-diagram-legend footer-diagram-legend--manager" aria-label="Status legend">
      <span className="footer-diagram-legend__stats">{phaseLabel}</span>
      <span className="footer-diagram-legend__sep" aria-hidden>
        ·
      </span>
      <span className="manager-legend__item manager-legend__item--ready">Ready</span>
      <span className="manager-legend__item manager-legend__item--review">Review</span>
      <span className="manager-legend__item manager-legend__item--blocked">Blocked</span>
      <span className="manager-legend__item manager-legend__item--pending">Pending</span>
    </div>
  );
}
