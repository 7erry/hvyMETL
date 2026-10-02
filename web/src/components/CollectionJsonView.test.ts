import { describe, expect, it } from 'vitest';
import type { CollectionPlan } from '../migrationPlanTypes';
import { serializeCollectionPlanJson } from './CollectionJsonView';

const minimalPlan: CollectionPlan = {
  name: 'loyaltyPrograms',
  sourceTable: 'loyalty_programs',
  mergedTables: ['loyalty_programs'],
  idDerivation: { strategy: 'direct', sourceColumns: ['program_id'] },
  patterns: [],
  jsonSchema: { properties: { tierName: { bsonType: 'string' } } },
  indexes: [],
  embeddedArrays: [],
  extendedReferences: [],
  computedFields: [],
};

describe('serializeCollectionPlanJson', () => {
  it('serializes a collection plan', () => {
    const text = serializeCollectionPlanJson(minimalPlan);
    expect(text).toContain('"name": "loyaltyPrograms"');
    expect(text).toContain('tierName');
  });
});
