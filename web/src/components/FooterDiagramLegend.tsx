type FooterDiagramLegendProps = {
  variant: 'sql' | 'mongo';
  stats: string;
};

/** Inline diagram legend embedded in the app footer. */
export function FooterDiagramLegend({ variant, stats }: FooterDiagramLegendProps) {
  return (
    <div className="footer-diagram-legend" aria-label="Diagram legend">
      <span className="footer-diagram-legend__stats">{stats}</span>
      <span className="footer-diagram-legend__sep" aria-hidden>
        ·
      </span>
      {variant === 'sql' ? (
        <>
          <span className="legend-chip">
            <i className="legend-swatch legend-swatch--pk" aria-hidden /> PK
          </span>
          <span className="legend-chip">
            <i className="legend-swatch legend-swatch--fk" aria-hidden /> FK
          </span>
        </>
      ) : (
        <>
          <span className="legend-chip">
            <i className="legend-swatch legend-swatch--pk" aria-hidden /> _id
          </span>
          <span className="legend-chip">
            <i className="legend-swatch legend-swatch--fk" aria-hidden /> Embed
          </span>
          <span className="legend-chip">
            <i className="legend-swatch legend-swatch--denorm" aria-hidden /> Denorm
          </span>
        </>
      )}
    </div>
  );
}
