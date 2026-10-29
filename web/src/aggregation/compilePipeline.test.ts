import { describe, expect, it } from 'vitest';
import { compileMatchNode, compilePipeline, parseFormValue } from './compilePipeline';
import { createStage, newId, type MatchNode, type PipelineStage } from './types';

describe('compilePipeline', () => {
  it('maps form compare operators under $and to Mongo syntax', () => {
    const tree: MatchNode = {
      id: newId(),
      kind: 'group',
      logic: 'and',
      children: [
        { id: newId(), kind: 'expr', field: 'status', op: 'eq', value: 'active' },
        { id: newId(), kind: 'expr', field: 'score', op: 'gte', value: '80' },
        { id: newId(), kind: 'expr', field: 'courseId', op: 'ne', value: 'course_x' },
      ],
    };

    expect(compileMatchNode(tree)).toEqual({
      $and: [
        { status: 'active' },
        { score: { $gte: 80 } },
        { courseId: { $ne: 'course_x' } },
      ],
    });

    const match = createStage('match');
    match.matchTree = tree;
    match.editMode = 'form';
    const limit = createStage('limit');
    limit.jsonText = '5';
    const disabled = createStage('skip');
    disabled.enabled = false;
    disabled.jsonText = '2';

    const stages: PipelineStage[] = [match, disabled, limit];
    const result = compilePipeline(stages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pipeline).toEqual([
      {
        $match: {
          $and: [
            { status: 'active' },
            { score: { $gte: 80 } },
            { courseId: { $ne: 'course_x' } },
          ],
        },
      },
      { $limit: 5 },
    ]);
  });

  it('parses JSON mode and numeric form values', () => {
    expect(parseFormValue('42')).toBe(42);
    expect(parseFormValue('active')).toBe('active');
    const stage = createStage('project');
    stage.editMode = 'json';
    stage.jsonText = '{ "courseId": 1, "status": 1 }';
    const result = compilePipeline([stage]);
    expect(result).toEqual({
      ok: true,
      pipeline: [{ $project: { courseId: 1, status: 1 } }],
    });
  });
});
