/** How FK relationship lines are routed on the ER canvas. */
export type RelationshipConnectionType = 'smoothstep' | 'bezier' | 'straight' | 'step';

/** What text/markers appear on relationship edges. */
export type RelationshipNotation = 'detailed' | 'columns' | 'cardinality' | 'none';

export const RELATIONSHIP_CONNECTION_OPTIONS: { id: RelationshipConnectionType; label: string }[] = [
  { id: 'bezier', label: 'Curved' },
  { id: 'smoothstep', label: 'Smooth step' },
  { id: 'straight', label: 'Straight' },
  { id: 'step', label: 'Orthogonal step' },
];

export const RELATIONSHIP_NOTATION_OPTIONS: { id: RelationshipNotation; label: string }[] = [
  { id: 'detailed', label: 'Full (table.column)' },
  { id: 'columns', label: 'Columns only' },
  { id: 'cardinality', label: 'Cardinality (N → 1)' },
  { id: 'none', label: 'Lines only' },
];

/** Build the edge label for one FK given the selected notation style. */
export function formatRelationshipLabel(
  notation: RelationshipNotation,
  childTable: string,
  fkColumn: string,
  parentTable: string,
  refColumn: string,
): string | undefined {
  switch (notation) {
    case 'none':
      return undefined;
    case 'cardinality':
      return 'N → 1';
    case 'columns':
      return `${fkColumn} → ${refColumn}`;
    case 'detailed':
    default:
      return `${childTable}.${fkColumn} → ${parentTable}.${refColumn}`;
  }
}
