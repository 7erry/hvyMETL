import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { inferWorkloadProfile } from '../profiles/inferProfile.js';
import { getProfile } from '../profiles/profiles.js';
import { parseDdlToModel } from '../utilities/ddlParser.js';

const LEDGER_SQL = join(dirname(fileURLToPath(import.meta.url)), '../../examples/ledger/ledger.sql');

describe('financial ledger example', () => {
  it('parses DDL, infers ledger profile, and produces a migration plan', () => {
    const ddl = readFileSync(LEDGER_SQL, 'utf8');
    const model = parseDdlToModel(ddl, 'ddl:postgresql');
    const inferred = inferWorkloadProfile(model);

    expect(inferred.profileId).toBe('ledger');
    expect(inferred.confidence).toBe('high');

    const plan = buildMigrationPlan(model, getProfile('ledger'));
    expect(plan.collections.length).toBeGreaterThan(0);
    expect(plan.collections.some((collection) => collection.sourceTable === 'journal_entries')).toBe(true);
    expect(plan.collections.every((collection) =>
      collection.patterns.some((decision) => decision.pattern === 'schema-versioning'),
    )).toBe(true);
  });
});
