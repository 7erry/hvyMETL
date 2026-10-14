import { describe, expect, it } from 'vitest';
import { iterateExtendedJsonText } from './mongoExtendedJson.js';
import { writeExtendedJsonBatches } from './mongoJsonBulkWriter.js';

const TEXT = ['{"name":"a","secret":"x"}', 'NOT JSON', '{"name":"b","secret":"y"}'].join('\n');
const SCHEMA = { bsonType: 'object', properties: { name: { bsonType: 'string' } } };

describe('writeExtendedJsonBatches', () => {
  it('records one bad line and still writes the good documents', async () => {
    const inserted: Record<string, unknown>[] = [];
    const result = await writeExtendedJsonBatches(iterateExtendedJsonText(TEXT), {
      strict: false,
      schema: SCHEMA,
      insertMany: async (docs) => {
        inserted.push(...docs);
        return { insertedCount: docs.length };
      },
    });

    expect(inserted).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(result.inserted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Line 2');
  });

  it('stops before later documents when strict', async () => {
    const inserted: Record<string, unknown>[] = [];
    const result = await writeExtendedJsonBatches(iterateExtendedJsonText(TEXT), {
      strict: true,
      schema: SCHEMA,
      insertMany: async (docs) => {
        inserted.push(...docs);
        return { insertedCount: docs.length };
      },
    });

    expect(inserted).toEqual([{ name: 'a' }]);
    expect(result.errors).toHaveLength(1);
  });
});
