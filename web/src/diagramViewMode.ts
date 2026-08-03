/** How the developer diagram area shows SQL vs MongoDB canvases. */
export type DiagramViewMode = 'split-horizontal' | 'split-vertical' | 'rel' | 'mdb';

export const DIAGRAM_VIEW_MODES: DiagramViewMode[] = ['split-horizontal', 'split-vertical', 'rel', 'mdb'];

export function isDualDiagramView(mode: DiagramViewMode): boolean {
  return mode === 'split-horizontal' || mode === 'split-vertical';
}

export function diagramViewModeFromSchemaPhase(phase: 'before' | 'after'): DiagramViewMode {
  return phase === 'before' ? 'rel' : 'mdb';
}

export function parseDiagramViewMode(value: unknown): DiagramViewMode | undefined {
  if (value === 'split-horizontal' || value === 'split-vertical' || value === 'rel' || value === 'mdb') {
    return value;
  }
  return undefined;
}
