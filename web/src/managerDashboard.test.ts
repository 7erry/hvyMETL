import { describe, expect, it } from 'vitest';
import {
  buildBusinessDomains,
  buildCloudResourceSummary,
  computeMigrationProgress,
  domainKeyForName,
} from './managerDashboard';
import type { MigrationPlan } from './migrationPlanTypes';
import type { SqlStructuralModel } from './types';

const model: SqlStructuralModel = {
  source: 'test',
  tables: [
    { name: 'users', columns: [], primaryKey: [], foreignKeys: [], rowCount: 0 },
    { name: 'usermeta', columns: [], primaryKey: [], foreignKeys: [], rowCount: 0 },
    { name: 'posts', columns: [], primaryKey: [], foreignKeys: [], rowCount: 0 },
  ],
};

const plan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: '2026-01-01T00:00:00.000Z',
  collections: [
    {
      name: 'users',
      sourceTable: 'users',
      mergedTables: ['users', 'usermeta'],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      patterns: [{ pattern: 'embed', target: 'users', reason: 'test', knowledgeSource: 'test' }],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [{ field: 'meta', sourceTable: 'usermeta', joinColumn: 'user_id' }],
      extendedReferences: [],
      computedFields: [],
    },
    {
      name: 'posts',
      sourceTable: 'posts',
      mergedTables: ['posts'],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('managerDashboard', () => {
  it('groups related tables into the same domain key', () => {
    expect(domainKeyForName('users')).toBe('user');
    expect(domainKeyForName('usermeta')).toBe('user');
    expect(domainKeyForName('posts')).toBe('post');
  });

  it('builds domains with readiness statuses', () => {
    const domains = buildBusinessDomains(model, plan, 'after', null);
    expect(domains.length).toBe(2);
    const userDomain = domains.find((d) => d.id === 'user');
    expect(userDomain?.entities.some((e) => e.status === 'review')).toBe(true);
    const progress = computeMigrationProgress(domains);
    expect(progress.totalCount).toBe(2);
    expect(progress.percent).toBe(100);
  });

  it('marks accepted reviews as ready', () => {
    const acceptances = {
      planGeneratedAt: plan.generatedAt,
      acceptedCollectionNames: ['users'],
    };
    const domains = buildBusinessDomains(model, plan, 'after', null, undefined, acceptances);
    const users = domains.flatMap((d) => d.entities).find((e) => e.name === 'users');
    expect(users?.status).toBe('ready');
    expect(users?.statusLabel).toBe('Approved');
    const progress = computeMigrationProgress(domains);
    expect(progress.reviewCount).toBe(0);
    expect(progress.readyCount).toBe(2);
  });

  it('builds cloud summary from real pipeline import counts', () => {
    const summary = buildCloudResourceSummary(
      {
        planJson: '{}',
        designReportMarkdown: '',
        prompts: [],
        generatedAt: '2026-01-01T12:00:00.000Z',
        pipelineResult: {
          ok: true,
          outDir: 'out/ui-pipeline',
          imports: [
            { collection: 'users', ok: true, insertedCount: 1200 },
            { collection: 'posts', ok: true, insertedCount: 450 },
          ],
        },
      },
      [
        {
          executionId: 'exec-1',
          startedAt: '2026-01-01T11:00:00.000Z',
          completedAt: '2026-01-01T12:00:00.000Z',
          ok: true,
          profileId: 'catalog',
          schemaDialect: 'postgresql',
          source: 'ddl:postgresql',
          targetDb: 'csv_to_atlas',
          retrievalStrategy: 'hybrid',
          imports: [{ collection: 'users', ok: true, insertedCount: 1200 }],
          errors: [],
          outDir: 'out/ui-pipeline',
        },
      ],
      { label: 'Catalog', readPercent: 80, writePercent: 20 },
    );

    expect(summary.documentsImported).toBe(1650);
    expect(summary.collectionsSucceeded).toBe(2);
    expect(summary.profileLabel).toBe('Catalog');
    expect(summary.readWriteRatio).toBe('80:20 read:write');
  });
});
