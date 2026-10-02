import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schemaFieldsFromCollection } from './schema/schemaFields';
import { serializeCollectionPlanJson } from './components/CollectionJsonView';
import type { MigrationPlan } from './migrationPlanTypes';

const oracleDiagramPath = path.resolve(
  import.meta.dirname,
  '../../examples/oracle/hvymetl-mongo-diagram-oracle-after.json',
);

describe('collection select smoke', () => {
  it('builds schema fields and JSON for every oracle collection', () => {
    const raw = JSON.parse(fs.readFileSync(oracleDiagramPath, 'utf8')) as { plan: MigrationPlan };
    const plan = raw.plan;
    for (const collection of plan.collections) {
      expect(() => schemaFieldsFromCollection(collection, plan)).not.toThrow();
      const json = serializeCollectionPlanJson(collection);
      expect(json).toContain(`"${collection.name}"`);
    }
  });
});
