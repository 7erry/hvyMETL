import { describe, expect, it } from 'vitest';
import { layoutGraph, layoutSqlModel } from './graphLayout';
import type { SqlStructuralModel } from './types';

describe('graphLayout', () => {
  it('places related tables in the same cluster with horizontal spacing', () => {
    const model: SqlStructuralModel = {
      source: 'test',
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true }],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true },
            { name: 'user_id', sqlType: 'INT', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['id'],
          foreignKeys: [
            {
              column: 'user_id',
              referencesTable: 'users',
              referencesColumn: 'id',
            },
          ],
          rowCount: 0,
        },
        {
          name: 'inventory',
          columns: [{ name: 'sku', sqlType: 'TEXT', nullable: false, isPrimaryKey: true }],
          primaryKey: ['sku'],
          foreignKeys: [],
          rowCount: 0,
        },
      ],
    };

    const positions = layoutSqlModel(model);
    expect(positions.users.x).toBeLessThan(positions.posts.x);
    const usersPostsDistance = Math.hypot(
      positions.posts.x - positions.users.x,
      positions.posts.y - positions.users.y,
    );
    expect(usersPostsDistance).toBeGreaterThan(200);
    const inventoryDistance = Math.hypot(
      positions.inventory.x - positions.users.x,
      positions.inventory.y - positions.users.y,
    );
    expect(inventoryDistance).toBeGreaterThan(usersPostsDistance);
  });

  it('packs disconnected components apart', () => {
    const positions = layoutGraph(
      ['a', 'b', 'c'],
      [{ source: 'b', target: 'a' }],
      undefined,
      { nodeWidth: 200, nodeHeight: 120, gapX: 100, gapY: 40, padding: 20, componentGapX: 300 },
    );
    expect(positions.b.x).toBeGreaterThan(positions.a.x);
    expect(positions.c.x - positions.b.x).toBeGreaterThan(250);
  });
});
