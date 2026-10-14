import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Decimal128, Long, ObjectId } from 'mongodb';
import { iterateExtendedJsonFile, iterateExtendedJsonText } from './mongoExtendedJson.js';

const CANONICAL = '{"_id":{"$oid":"507f1f77bcf86cd799439011"},"created":{"$date":"2020-01-01T00:00:00.000Z"},"qty":{"$numberLong":"42"},"price":{"$numberDecimal":"19.99"}}';

describe('iterateExtendedJsonText', () => {
  it('parses Canonical Extended JSON types and NDJSON line by line', async () => {
    const [document] = [...iterateExtendedJsonText(CANONICAL)];
    expect(document?.ok).toBe(true);
    if (!document?.ok) return;
    expect(document.value._id).toBeInstanceOf(ObjectId);
    expect(document.value.created).toBeInstanceOf(Date);
    expect(document.value.qty).toBeInstanceOf(Long);
    expect(document.value.price).toBeInstanceOf(Decimal128);
    expect(String(document.value.price)).toBe('19.99');

    const ndjson = `${CANONICAL}\nNOT JSON\n{"name":"b"}\n`;
    const records = [...iterateExtendedJsonText(ndjson)];
    expect(records.map((record) => record.ok)).toEqual([true, false, true]);
    expect(records[1]?.ok === false ? records[1].line : 0).toBe(2);

    const arrayRecords = [...iterateExtendedJsonText(`[${CANONICAL},{"name":"b"}]`)];
    expect(arrayRecords.map((record) => record.ok)).toEqual([true, true]);

    const relaxed = [...iterateExtendedJsonText('{"created":{"$date":"2020-01-01T00:00:00Z"},"qty":42}')];
    expect(relaxed[0]?.ok).toBe(true);

    const directory = mkdtempSync(join(tmpdir(), 'hvymetl-json-'));
    const filePath = join(directory, 'docs.ndjson');
    writeFileSync(filePath, ndjson);
    const fromFile = [];
    for await (const record of iterateExtendedJsonFile(filePath)) fromFile.push(record.ok);
    expect(fromFile).toEqual([true, false, true]);
  });
});
