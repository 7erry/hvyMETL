import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { schemaFieldsFromCollection } from '../schema/schemaFields';
import type { MigrationPlan } from '../migrationPlanTypes';
import { CollectionDetails } from './CollectionDetails';

const oracleDiagramPath = path.resolve(
  import.meta.dirname,
  '../../../examples/oracle/hvymetl-mongo-diagram-oracle-after.json',
);

describe('CollectionDetails render', () => {
  it('renders table and JSON modes for oracle collections', () => {
    const raw = JSON.parse(fs.readFileSync(oracleDiagramPath, 'utf8')) as { plan: MigrationPlan };
    for (const collection of raw.plan.collections) {
      const schemaFields = schemaFieldsFromCollection(collection, raw.plan);
      const tableHtml = renderToStaticMarkup(
        createElement(CollectionDetails, {
          collection,
          schemaFields,
          viewMode: 'table',
          onViewModeChange: () => undefined,
          onClose: () => undefined,
        }),
      );
      expect(tableHtml).toContain(collection.name);
      expect(tableHtml).toContain('Patterns');

      const jsonHtml = renderToStaticMarkup(
        createElement(CollectionDetails, {
          collection,
          schemaFields,
          viewMode: 'json',
          onViewModeChange: () => undefined,
          onClose: () => undefined,
        }),
      );
      expect(jsonHtml).toContain('language-json');
    }
  });

  it('renders partial plans missing optional arrays', () => {
    const partial = {
      name: 'orders',
      sourceTable: 'orders',
    } as MigrationPlan['collections'][number];

    const html = renderToStaticMarkup(
      createElement(CollectionDetails, {
        collection: partial,
        schemaFields: [],
        viewMode: 'table',
        onViewModeChange: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(html).toContain('orders');
  });
});
