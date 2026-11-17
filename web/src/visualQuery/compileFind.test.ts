import { describe, expect, it } from 'vitest';
import { newId, type MatchNode } from '../aggregation/types';
import {
  buildFindScript,
  buildSampleFieldsScript,
  compileFindQuery,
  fieldNamesFromShellOutput,
  FIND_RESULT_LIMIT,
  formatFindAsShell,
  projectionJsonText,
  projectionStateFromJson,
  resolveCompiledFind,
  sortJsonText,
  sortRowsFromJson,
} from './compileFind';
import {
  createProjectionRow,
  createSortRow,
  defaultFindQueryState,
  type FindQueryState,
} from './types';

function filterTree(): MatchNode {
  return {
    id: newId(),
    kind: 'group',
    logic: 'and',
    children: [
      { id: newId(), kind: 'expr', field: 'currency', op: 'eq', value: 'USD' },
      { id: newId(), kind: 'expr', field: 'amount', op: 'gt', value: '250' },
    ],
  };
}

describe('compileFindQuery', () => {
  it('compiles form filter ops and projection include/exclude', () => {
    const state: FindQueryState = {
      ...defaultFindQueryState(),
      filter: filterTree(),
      projectionEnabled: true,
      projection: [
        createProjectionRow('_id', true),
        createProjectionRow('amount', true),
        createProjectionRow('secret', false),
      ],
      sort: [createSortRow('paidAt', -1)],
      skip: 2,
      limit: 5,
    };
    const result = compileFindQuery(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compiled.filter).toEqual({
      $and: [{ currency: 'USD' }, { amount: { $gt: 250 } }],
    });
    expect(result.compiled.projection).toEqual({ _id: 1, amount: 1, secret: 0 });
    expect(result.compiled.sort).toEqual({ paidAt: -1 });
    expect(result.compiled.skip).toBe(2);
    expect(result.compiled.limit).toBe(5);
  });

  it('formats shell find and builds getSiblingDB script', () => {
    const state: FindQueryState = {
      ...defaultFindQueryState(),
      filter: filterTree(),
      projectionEnabled: true,
      projection: [createProjectionRow('currency', true)],
      sort: [createSortRow('amount', 1)],
      skip: 0,
      limit: 10,
    };
    const result = compileFindQuery(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shell = formatFindAsShell('payments', result.compiled);
    expect(shell).toContain('getCollection("payments")');
    expect(shell).toContain('.find(');
    expect(shell).toContain('.sort({"amount":1})');
    expect(shell).toContain('.limit(10)');
    const script = buildFindScript('learningPlatform', 'payments', result.compiled);
    expect(script).toContain('getSiblingDB("learningPlatform")');
    expect(script).toContain('getCollection("payments")');
    expect(script).toContain(`limit(${Math.min(10, FIND_RESULT_LIMIT)})`);
    expect(script).toContain('EJSON.stringify');
  });

  it('samples field names via getSiblingDB findOne script', () => {
    const script = buildSampleFieldsScript('learningPlatform', 'payments');
    expect(script).toContain('getSiblingDB("learningPlatform")');
    expect(script).toContain('getCollection("payments")');
    expect(script).toContain('findOne()');
    expect(fieldNamesFromShellOutput('[" _id ","amount","status"]'.replace(/ /g, ''))).toEqual([
      '_id',
      'amount',
      'status',
    ]);
    expect(fieldNamesFromShellOutput('noise\n["_id","currency"]\nok')).toEqual(['_id', 'currency']);
  });

  it('parses JSON edit mode', () => {
    const state: FindQueryState = {
      ...defaultFindQueryState(),
      editMode: 'json',
      jsonText: JSON.stringify({
        filter: { status: 'paid' },
        projection: { amount: 1 },
        sort: { paidAt: -1 },
        skip: 1,
        limit: 3,
      }),
    };
    const result = compileFindQuery(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compiled.filter).toEqual({ status: 'paid' });
    expect(result.compiled.projection).toEqual({ amount: 1 });
    expect(result.compiled.skip).toBe(1);
    expect(result.compiled.limit).toBe(3);
  });

  it('round-trips flat sort and projection JSON', () => {
    const sort = sortRowsFromJson('{"paidAt":-1,"amount":1}');
    expect(sort).toEqual([
      expect.objectContaining({ field: 'paidAt', direction: -1, enabled: true }),
      expect.objectContaining({ field: 'amount', direction: 1, enabled: true }),
    ]);
    expect(sortJsonText(sort ?? [])).toBe('{"paidAt":-1,"amount":1}');

    const projection = projectionStateFromJson('{"_id":1,"secret":0}');
    expect(projection?.projectionEnabled).toBe(true);
    expect(projection?.projection.map((row) => [row.field, row.include, row.enabled])).toEqual([
      ['_id', true, true],
      ['secret', false, true],
    ]);
    expect(projectionJsonText(projection?.projection ?? [], true)).toBe('{"_id":1,"secret":0}');

    expect(sortRowsFromJson('{')).toBeNull();
    expect(sortRowsFromJson('{}')).toEqual([]);
    expect(projectionStateFromJson('{"a":2}')).toBeNull();
    expect(projectionStateFromJson('{}')?.projectionEnabled).toBe(false);
  });

  it('uses typed filter JSON until the builder replaces it', () => {
    const state = defaultFindQueryState();
    const overridden = resolveCompiledFind(state, '{"status":"paid"}');
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) return;
    expect(overridden.compiled.filter).toEqual({ status: 'paid' });
    expect(resolveCompiledFind(state, '{').ok).toBe(false);
    const form = resolveCompiledFind(state, null);
    const fromForm = compileFindQuery(state);
    expect(form.ok && fromForm.ok).toBe(true);
    if (!form.ok || !fromForm.ok) return;
    expect(form.compiled.filter).toEqual(fromForm.compiled.filter);
  });
});
