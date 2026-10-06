import { describe, expect, it } from 'vitest';
import { reconcileDiagramViewWithSchemaPhase } from './diagramViewMode';

describe('reconcileDiagramViewWithSchemaPhase', () => {
  it('maps After phase away from SQL-only REL view', () => {
    expect(reconcileDiagramViewWithSchemaPhase('after', 'rel')).toBe('mdb');
  });

  it('maps Before phase away from Mongo-only MDB view', () => {
    expect(reconcileDiagramViewWithSchemaPhase('before', 'mdb')).toBe('rel');
  });

  it('preserves split views for either phase', () => {
    expect(reconcileDiagramViewWithSchemaPhase('after', 'split-vertical')).toBe('split-vertical');
    expect(reconcileDiagramViewWithSchemaPhase('before', 'split-horizontal')).toBe('split-horizontal');
  });
});
