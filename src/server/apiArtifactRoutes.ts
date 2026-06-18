/**
 * HTTP routes for generated OpenAPI specs, MongoDB validator schemas, and Swagger UI.
 */

import type { Express, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import swaggerUi from 'swagger-ui-express';
import {
  getActiveApiArtifacts,
  readJsonArtifact,
  registerApiArtifacts,
  serializeApiArtifactBundle,
  type ApiArtifactBundle,
} from './apiArtifactStore.js';

function resolveBundle(req: Request, defaultOutDir: string): ApiArtifactBundle | null {
  const requested = String(req.query?.outDir ?? '').trim();
  if (requested) {
    const registered = registerApiArtifacts(requested, 'query');
    if (registered) return registered;
  }
  return getActiveApiArtifacts(defaultOutDir);
}

function findCollection(bundle: ApiArtifactBundle, name: string) {
  return bundle.collections.find((collection) => collection.name === name);
}

export function registerApiArtifactRoutes(app: Express, rootDir: string): void {
  const defaultOutDir = join(rootDir, 'out', 'ui-export');

  app.get('/api/artifacts', (req, res) => {
    const bundle = resolveBundle(req, defaultOutDir);
    if (!bundle) {
      res.status(404).json({
        error: 'No API artifacts found. Run design, AI Migration Export, or the full pipeline first.',
      });
      return;
    }
    res.json(serializeApiArtifactBundle(bundle));
  });

  app.get('/api/artifacts/openapi.json', (req, res) => {
    const bundle = resolveBundle(req, defaultOutDir);
    if (!bundle) {
      res.status(404).json({ error: 'Combined OpenAPI spec not found.' });
      return;
    }
    res.type('application/json').send(readJsonArtifact(bundle.combinedOpenApiPath));
  });

  app.get('/api/artifacts/openapi/:collectionName', (req, res) => {
    const bundle = resolveBundle(req, defaultOutDir);
    if (!bundle) {
      res.status(404).json({ error: 'OpenAPI artifacts not found.' });
      return;
    }
    const collection = findCollection(bundle, req.params.collectionName);
    if (!collection || !existsSync(collection.openApiPath)) {
      res.status(404).json({ error: `OpenAPI spec not found for collection: ${req.params.collectionName}` });
      return;
    }
    res.type('application/json').send(readJsonArtifact(collection.openApiPath));
  });

  app.get('/api/artifacts/schemas/:collectionName', (req, res) => {
    const bundle = resolveBundle(req, defaultOutDir);
    if (!bundle) {
      res.status(404).json({ error: 'Schema artifacts not found.' });
      return;
    }
    const collection = findCollection(bundle, req.params.collectionName);
    if (!collection || !existsSync(collection.schemaPath)) {
      res.status(404).json({ error: `Schema not found for collection: ${req.params.collectionName}` });
      return;
    }
    res.type('application/json').send(readJsonArtifact(collection.schemaPath));
  });

  app.use('/api/docs', swaggerUi.serve);
  app.get(
    '/api/docs',
    swaggerUi.setup(undefined, {
      customSiteTitle: 'hvyMETL Migration API',
      swaggerOptions: {
        url: '/api/artifacts/openapi.json',
        persistAuthorization: true,
      },
    }),
  );

  app.get('/api/docs/openapi.json', (_req: Request, res: Response) => {
    res.redirect('/api/artifacts/openapi.json');
  });
}