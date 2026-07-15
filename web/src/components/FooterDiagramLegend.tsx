import {
  MongoDenormTagIcon,
  MongoEmbedTagIcon,
  MongoIdTagIcon,
  SqlFkTagIcon,
  SqlPkTagIcon,
} from '../fieldTagIcons';

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
            <SqlPkTagIcon /> PK
          </span>
          <span className="legend-chip">
            <SqlFkTagIcon /> FK
          </span>
        </>
      ) : (
        <>
          <span className="legend-chip">
            <MongoIdTagIcon /> _id
          </span>
          <span className="legend-chip">
            <MongoEmbedTagIcon /> Embed
          </span>
          <span className="legend-chip">
            <MongoDenormTagIcon /> Denorm
          </span>
        </>
      )}
    </div>
  );
}
