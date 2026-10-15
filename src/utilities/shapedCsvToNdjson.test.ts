import { describe, expect, it } from 'vitest';
import { shapedCsvTextToNdjson } from './shapedCsvToNdjson.js';

describe('shapedCsvTextToNdjson', () => {
  it('nests dotted headers, parses array cells, and coerces scalars', () => {
    const csv = [
      '_id,brand.name,price,active,note,reviews[]',
      '1,Acme,12.5,true,null,"[{""rating"":5}]"',
    ].join('\n');

    expect(shapedCsvTextToNdjson(csv)).toBe(
      `${JSON.stringify({
        _id: 1,
        brand: { name: 'Acme' },
        price: 12.5,
        active: true,
        note: null,
        reviews: [{ rating: 5 }],
      })}\n`,
    );
  });
});
