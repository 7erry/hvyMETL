/**
 * Regression tests that seeded example databases trigger the design patterns
 * documented in examples/README.md and docs/10-examples.md.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import { createSqliteAdapter } from '../adapters/sqlite.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { WORKLOAD_PROFILES } from '../profiles/profiles.js';
import type { MigrationPlan, PatternId } from '../types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXAMPLES_DIR = join(REPO_ROOT, 'examples');

/** Collect every pattern id stamped anywhere in a migration plan. */
function patternsInPlan(plan: MigrationPlan): Set<PatternId> {
  const patterns = new Set<PatternId>();
  for (const collection of plan.collections) {
    for (const decision of collection.patterns) {
      patterns.add(decision.pattern);
    }
  }
  return patterns;
}

/** Run design against one seeded example database. */
function designExample(domain: string, profileId: keyof typeof WORKLOAD_PROFILES): MigrationPlan {
  const source = join(EXAMPLES_DIR, domain, `${domain}.db`);
  const adapter = createSqliteAdapter(source);
  return buildMigrationPlan(adapter.introspect(), WORKLOAD_PROFILES[profileId]);
}

/** Assert every listed pattern appears at least once in the plan. */
function expectPatterns(plan: MigrationPlan, required: PatternId[]): void {
  const found = patternsInPlan(plan);
  for (const pattern of required) {
    expect(found.has(pattern), `expected pattern "${pattern}" in plan collections: ${[...found].join(', ')}`).toBe(
      true,
    );
  }
}

describe('example pattern coverage', () => {
  beforeAll(() => {
    const catalogDb = join(EXAMPLES_DIR, 'catalog', 'catalog.db');
    if (!existsSync(catalogDb)) {
      execSync('npm run -s seed-examples', { cwd: REPO_ROOT, stdio: 'pipe' });
    }
  });

  it('catalog triggers attribute, subset, outlier, tree, archive, and extended-reference', () => {
    const plan = designExample('catalog', 'catalog');
    expectPatterns(plan, [
      'attribute',
      'subset',
      'outlier',
      'tree',
      'archive',
      'extended-reference',
      'schema-versioning',
    ]);
    expect(plan.collections.some((collection) => collection.name === 'reviews_archive')).toBe(true);
  });

  it('cms triggers polymorphic blocks and tree pages', () => {
    const plan = designExample('cms', 'cms');
    expectPatterns(plan, ['polymorphic', 'tree', 'outlier', 'extended-reference', 'schema-versioning']);
    const blocks = plan.collections.find((collection) => collection.sourceTable === 'content_blocks');
    expect(blocks?.patterns.some((decision) => decision.pattern === 'polymorphic')).toBe(true);
  });

  it('iot buckets the sensor_readings firehose', () => {
    const plan = designExample('iot', 'iot');
    expectPatterns(plan, ['bucket', 'computed', 'schema-versioning']);
    expect(plan.collections.some((collection) => collection.sourceTable === 'sensor_readings')).toBe(true);
  });

  it('mobile buckets app_events', () => {
    const plan = designExample('mobile', 'mobile');
    expectPatterns(plan, ['bucket', 'extended-reference', 'schema-versioning']);
  });

  it('personalization folds sparse traits via attribute pattern', () => {
    const plan = designExample('personalization', 'personalization');
    expectPatterns(plan, ['attribute', 'computed', 'schema-versioning']);
  });

  it('analytics buckets page_events', () => {
    const plan = designExample('analytics', 'realtime-analytics');
    expectPatterns(plan, ['bucket', 'computed', 'schema-versioning']);
  });

  it('singleview denormalizes customer-360 reads with extended-reference', () => {
    const plan = designExample('singleview', 'single-view');
    expectPatterns(plan, ['extended-reference', 'embed', 'schema-versioning']);
  });

  it('cms with mobile profile merges page_tags into a single-collection hub', () => {
    const source = join(EXAMPLES_DIR, 'cms', 'cms.db');
    const plan = buildMigrationPlan(createSqliteAdapter(source).introspect(), WORKLOAD_PROFILES.mobile);
    expectPatterns(plan, ['single-collection']);
    expect(plan.collections.some((collection) => collection.name === 'pages_tags')).toBe(true);
  });

  it('personalization with mobile profile merges profile_segments into a single-collection hub', () => {
    const source = join(EXAMPLES_DIR, 'personalization', 'personalization.db');
    const plan = buildMigrationPlan(createSqliteAdapter(source).introspect(), WORKLOAD_PROFILES.mobile);
    expectPatterns(plan, ['single-collection']);
    expect(plan.collections.some((collection) => collection.name === 'profiles_segments')).toBe(true);
  });

  it('covers every automated pattern id except preallocation across all examples', () => {
    const plans = [
      designExample('catalog', 'catalog'),
      designExample('cms', 'cms'),
      designExample('iot', 'iot'),
      designExample('mobile', 'mobile'),
      designExample('personalization', 'personalization'),
      designExample('analytics', 'realtime-analytics'),
      designExample('singleview', 'single-view'),
      buildMigrationPlan(createSqliteAdapter(join(EXAMPLES_DIR, 'cms', 'cms.db')).introspect(), WORKLOAD_PROFILES.mobile),
    ];

    const union = new Set<PatternId>();
    for (const plan of plans) {
      for (const pattern of patternsInPlan(plan)) {
        union.add(pattern);
      }
    }

    const expectedAutomated: PatternId[] = [
      'attribute',
      'archive',
      'bucket',
      'computed',
      'embed',
      'extended-reference',
      'outlier',
      'polymorphic',
      'reference',
      'schema-versioning',
      'single-collection',
      'subset',
      'tree',
    ];

    for (const pattern of expectedAutomated) {
      expect(union.has(pattern), `suite missing automated pattern "${pattern}"`).toBe(true);
    }
    expect(union.has('preallocation')).toBe(false);
  });
});
