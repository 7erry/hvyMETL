import { describe, expect, it } from 'vitest';
import { buildAggregateScript, stagesBefore, stagesThrough } from './liveAggregate';

describe('buildAggregateScript', () => {
  it('targets sibling DB + collection and prints EJSON aggregate results', () => {
    const script = buildAggregateScript('learningPlatform', 'enrollments', [
      { $match: { status: 'active' } },
    ]);
    expect(script).toContain('getSiblingDB("learningPlatform")');
    expect(script).toContain('getCollection("enrollments")');
    expect(script).toContain('"$match"');
    expect(script).toContain('"$limit"');
    expect(script).toContain('EJSON.stringify');
    expect(script).not.toMatch(/mongosh.*learningPlatform/);
  });

  it('rejects empty database or collection', () => {
    expect(() => buildAggregateScript('', 'c', [])).toThrow(/Database/);
    expect(() => buildAggregateScript('db', '  ', [])).toThrow(/Collection/);
  });
});

describe('stagesThrough / stagesBefore', () => {
  const stages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('slices inclusive / exclusive around the preview stage', () => {
    expect(stagesThrough(stages, 'b').map((s) => s.id)).toEqual(['a', 'b']);
    expect(stagesBefore(stages, 'b').map((s) => s.id)).toEqual(['a']);
    expect(stagesThrough(stages, null)).toEqual(stages);
    expect(stagesBefore(stages, null)).toEqual([]);
  });
});
