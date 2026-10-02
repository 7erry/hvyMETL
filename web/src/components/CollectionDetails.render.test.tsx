import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from '../migrationPlanTypes';
import { CollectionDetails } from './CollectionDetails';

const oracleDiagramPath = path.resolve(
  import.meta.dirname,
  '../../../examples/oracle/hvymetl-mongo-diagram-oracle-after.json',
);

describe('CollectionDetails render', () => {
  it('renders every oracle collection without throwing', () => {
    const raw = JSON.parse(fs.readFileSync(oracleDiagramPath, 'utf8')) as { plan: MigrationPlan };
    for (const collection of raw.plan.collections) {
      const html = renderToStaticMarkup(
        createElement(CollectionDetails, { collection, onClose: () => undefined }),
      );
      expect(html).toContain(collection.name);
      expect(html).toContain('language-json');
    }
  });

  it('renders partial plans missing optional arrays', () => {
    const partial = {
      name: 'orders',
      sourceTable: 'orders',
    } as MigrationPlan['collections'][number];

    const html = renderToStaticMarkup(
      createElement(CollectionDetails, { collection: partial, onClose: () => undefined }),
    );
    expect(html).toContain('orders');
  });
});
