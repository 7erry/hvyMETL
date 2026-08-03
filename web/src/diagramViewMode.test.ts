import { describe, expect, it } from 'vitest';
import { diagramViewModeFromSchemaPhase, isDualDiagramView } from './diagramViewMode';

describe('diagramViewMode', () => {
  it('maps schema phase to rel/mdb single views', () => {
    expect(diagramViewModeFromSchemaPhase('before')).toBe('rel');
    expect(diagramViewModeFromSchemaPhase('after')).toBe('mdb');
  });

  it('detects dual split modes', () => {
    expect(isDualDiagramView('split-horizontal')).toBe(true);
    expect(isDualDiagramView('split-vertical')).toBe(true);
    expect(isDualDiagramView('rel')).toBe(false);
  });
});
