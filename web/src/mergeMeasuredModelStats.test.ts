import { describe, expect, it } from 'vitest';
import { parseDdlToModel } from '../../src/utilities/ddlParser.js';
import { mergeMeasuredModelStats } from './mergeMeasuredModelStats';

describe('mergeMeasuredModelStats', () => {
  it('merges measured row counts and relationship percentiles without replacing tables', () => {
    const base = parseDdlToModel(
      `CREATE TABLE parents (id INT PRIMARY KEY);
       CREATE TABLE children (id INT PRIMARY KEY, parent_id INT REFERENCES parents(id));`,
      'ddl:postgresql',
    );
    const measured = {
      ...base,
      tables: base.tables.map((table) =>
        table.name === 'children' ? { ...table, rowCount: 100 } : { ...table, rowCount: 10 },
      ),
      relationships: base.relationships.map((relationship) => ({
        ...relationship,
        minChildrenPerParent: 1,
        avgChildrenPerParent: 10,
        p95ChildrenPerParent: 18,
        p99ChildrenPerParent: 20,
        maxChildrenPerParent: 20,
        isBounded: true,
        cardinalitySource: 'csv' as const,
      })),
    };

    const merged = mergeMeasuredModelStats(base, measured);
    expect(merged.tables.find((table) => table.name === 'children')?.rowCount).toBe(100);
    expect(merged.relationships[0]).toMatchObject({
      minChildrenPerParent: 1,
      p95ChildrenPerParent: 18,
      maxChildrenPerParent: 20,
      cardinalitySource: 'csv',
    });
  });
});
