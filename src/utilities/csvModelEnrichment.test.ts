import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDdlToModel } from './ddlParser.js';
import {
  enrichModelFromCsv,
  loadTableCsvRows,
  measureRelationshipFromCsv,
} from './csvModelEnrichment.js';

const ORACLE_ROOT = join(process.cwd(), 'examples', 'oracle');

describe('csvModelEnrichment', () => {
  it('measures order_items as multi-row per parent from CSV', () => {
    const rows = loadTableCsvRows(ORACLE_ROOT, 'order_items');
    const stats = measureRelationshipFromCsv(rows, 'order_id');
    expect(stats.maxChildrenPerParent).toBeGreaterThan(1);
    expect(stats.isBounded).toBe(true);
  });

  it('enriches DDL-only relationships with CSV cardinality', () => {
    const ddl = readFileSync(join(ORACLE_ROOT, 'oracle-all.ddl'), 'utf8');
    const model = parseDdlToModel(ddl, 'ddl:oracle');
    const enriched = enrichModelFromCsv(model, ORACLE_ROOT);

    const orderItemsRel = enriched.relationships.find(
      (rel) => rel.parentTable === 'orders' && rel.childTable === 'order_items',
    );
    expect(orderItemsRel?.maxChildrenPerParent).toBeGreaterThan(1);
    expect(orderItemsRel?.isBounded).toBe(true);

    const ordersTable = enriched.tables.find((table) => table.name === 'orders');
    expect(ordersTable?.rowCount).toBeGreaterThan(0);
  });

  it('leaves DDL relationships unbounded when child CSV is missing', () => {
    const model = parseDdlToModel(
      `CREATE TABLE parents (id INT PRIMARY KEY);
       CREATE TABLE children (id INT PRIMARY KEY, parent_id INT REFERENCES parents(id));`,
      'ddl:postgresql',
    );
    const enriched = enrichModelFromCsv(model, ORACLE_ROOT);
    const rel = enriched.relationships.find((r) => r.childTable === 'children');
    expect(rel).toMatchObject({ avgChildrenPerParent: 0, maxChildrenPerParent: 0, isBounded: false });
  });
});

describe('parseDdlToModel relationship defaults', () => {
  it('uses unknown cardinality defaults instead of bounded 1:1', () => {
    const model = parseDdlToModel(
      `CREATE TABLE a (id INT PRIMARY KEY);
       CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));`,
      'ddl:oracle',
    );
    expect(model.relationships[0]).toMatchObject({
      avgChildrenPerParent: 0,
      maxChildrenPerParent: 0,
      isBounded: false,
    });
  });
});
