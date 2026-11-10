import { describe, expect, it } from 'vitest';
import { newId, type MatchNode } from '../aggregation/types';
import {
  buildFindScript,
  compileFindQuery,
  FIND_RESULT_LIMIT,
  formatFindAsShell,
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
});
