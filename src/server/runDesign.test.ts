import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { getProfile } from '../profiles/profiles.js';
import { buildDesignMeta } from './runDesign.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PERSONALIZATION_ROOT = join(ROOT, 'examples', 'personalization');

describe('runDesign buildDesignMeta', () => {
  it('reports folded tables when CSV enrichment enables embed patterns', () => {
    const ddl = readFileSync(join(PERSONALIZATION_ROOT, 'personalization.sql'), 'utf8');
    const raw = parseDdlToModel(ddl, 'ddl:oracle');
    const enriched = enrichModelFromCsv(raw, PERSONALIZATION_ROOT);
    const plan = buildMigrationPlan(enriched, getProfile('catalog'));
    const meta = buildDesignMeta(raw, enriched, plan, PERSONALIZATION_ROOT);

    expect(meta.hasRowStats).toBe(true);
    expect(meta.csvEnriched).toBe(true);
    expect(meta.collectionCount).toBeLessThan(meta.sqlTableCount);
    expect(meta.foldedTableCount).toBeGreaterThan(0);
  });

  it('shows 1:1 mapping without row stats on DDL-only model', () => {
    const ddl = readFileSync(join(ROOT, 'examples', 'iot', 'iot.sql'), 'utf8');
    const raw = parseDdlToModel(ddl, 'ddl:oracle');
    const plan = buildMigrationPlan(raw, getProfile('iot'));
    const meta = buildDesignMeta(raw, raw, plan);

    expect(meta.hasRowStats).toBe(false);
    expect(meta.collectionCount).toBe(meta.sqlTableCount);
    expect(meta.foldedTableCount).toBe(0);
  });
});
