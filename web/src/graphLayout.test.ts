import { describe, expect, it } from 'vitest';
import { layoutGraph, layoutSqlModel, MONGO_GRAPH_LAYOUT_OPTIONS } from './graphLayout';
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
    expect(positions.posts.x).toBeLessThan(positions.users.x);
    const usersPostsDistance = Math.hypot(
      positions.posts.x - positions.users.x,
      positions.posts.y - positions.users.y,
    );
    expect(usersPostsDistance).toBeGreaterThan(200);
    const inventoryDistance = Math.hypot(
      positions.inventory.x - positions.posts.x,
      positions.inventory.y - positions.posts.y,
    );
    expect(inventoryDistance).toBeGreaterThan(usersPostsDistance);
  });

  it('places hub tables between outgoing-only and incoming-only tables', () => {
    const model: SqlStructuralModel = {
      source: 'test',
      tables: [
        {
          name: 'refdata_status',
          columns: [{ name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true }],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true },
            { name: 'status_id', sqlType: 'INT', nullable: false, isPrimaryKey: false },
            { name: 'customer_id', sqlType: 'INT', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['id'],
          foreignKeys: [
            { column: 'status_id', referencesTable: 'refdata_status', referencesColumn: 'id' },
            { column: 'customer_id', referencesTable: 'customers', referencesColumn: 'id' },
          ],
          rowCount: 0,
        },
        {
          name: 'customers',
          columns: [{ name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true }],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
        },
        {
          name: 'order_lines',
          columns: [
            { name: 'id', sqlType: 'INT', nullable: false, isPrimaryKey: true },
            { name: 'order_id', sqlType: 'INT', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['id'],
          foreignKeys: [{ column: 'order_id', referencesTable: 'orders', referencesColumn: 'id' }],
          rowCount: 0,
        },
      ],
    };

    const positions = layoutSqlModel(model);
    expect(positions.order_lines.x).toBeLessThan(positions.orders.x);
    expect(positions.orders.x).toBeLessThan(positions.refdata_status.x);
    expect(positions.orders.x).toBeLessThan(positions.customers.x);
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

  it('uses forty pixel gaps for mongo default layout options', () => {
    const positions = layoutGraph(
      ['users', 'orders'],
      [{ source: 'orders', target: 'users' }],
      undefined,
      MONGO_GRAPH_LAYOUT_OPTIONS,
    );
    expect(positions.orders.x - positions.users.x).toBe(300);
  });
});
