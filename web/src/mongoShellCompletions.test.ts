import { describe, expect, it } from 'vitest';
import {
  applyMongoShellCompletion,
  mongoShellCompletionsFor,
  type MongoShellSchemaContext,
} from './mongoShellCompletions';

const schema: MongoShellSchemaContext = {
  database: 'shop',
  collections: [
    { name: 'orders', fields: ['customerEmail', 'customerId', 'total'] },
    { name: 'products', fields: ['sku', 'price'] },
  ],
};

describe('mongoShellCompletions', () => {
  it('filters by line prefix', () => {
    const hits = mongoShellCompletionsFor('show col', 8);
    expect(hits.some((h) => h.insert === 'show collections')).toBe(true);
  });

  it('suggests collection methods after a receiver', () => {
    const src = 'db.getCollection("orders").fi';
    const hits = mongoShellCompletionsFor(src, src.length);
    expect(hits.some((h) => h.insert === 'find(' && h.mode === 'member')).toBe(true);
    expect(hits.some((h) => h.detail?.includes('findOne'))).toBe(true);
  });

  it('suggests collection names from schema after db.', () => {
    const src = 'db.ord';
    const hits = mongoShellCompletionsFor(src, src.length, schema);
    expect(hits.some((h) => h.insert === 'db.orders.')).toBe(true);
  });

  it('suggests operators after $', () => {
    const src = 'db.orders.aggregate([{ $ma';
    const hits = mongoShellCompletionsFor(src, src.length, schema);
    expect(hits.some((h) => h.label === '$match' && h.mode === 'token')).toBe(true);
  });

  it('suggests find query operators by category', () => {
    const src = 'db.orders.find({ status: { $';
    const hits = mongoShellCompletionsFor(src, src.length, schema);
    expect(hits.some((h) => h.label === '$eq' && h.detail?.includes('comparison'))).toBe(true);
    expect(hits.some((h) => h.label === '$or' && h.detail?.includes('logical'))).toBe(true);
    expect(hits.some((h) => h.label === '$exists' && h.detail?.includes('element'))).toBe(true);
    expect(hits.some((h) => h.label === '$regex' && h.detail?.includes('evaluation'))).toBe(true);
    expect(hits.some((h) => h.label === '$elemMatch' && h.detail?.includes('array'))).toBe(true);
    expect(hits.some((h) => h.label === '$bitsAllSet' && h.detail?.includes('bitwise'))).toBe(true);
    expect(hits.some((h) => h.label === '$match')).toBe(false);
  });

  it('suggests fields inside find filter', () => {
    const src = 'db.orders.find({ custo';
    const hits = mongoShellCompletionsFor(src, src.length, schema);
    expect(hits.some((h) => h.label === 'customerEmail')).toBe(true);
  });

  it('applies member completion after the last dot', () => {
    const src = 'db.accounts.fi';
    const next = applyMongoShellCompletion(src, src.length, {
      label: 'db.accounts.find',
      insert: 'find(',
      mode: 'member',
    });
    expect(next.script).toBe('db.accounts.find(');
  });

  it('applies token completion for operators', () => {
    const src = '[{ $ma';
    const next = applyMongoShellCompletion(src, src.length, {
      label: '$match',
      insert: '$match: {',
      mode: 'token',
    });
    expect(next.script).toBe('[{ $match: {');
  });

  it('applies completion over the current line prefix', () => {
    const next = applyMongoShellCompletion('  show col', 10, {
      label: 'show collections',
      insert: 'show collections',
    });
    expect(next.script).toBe('  show collections');
    expect(next.caret).toBe('  show collections'.length);
  });
});
