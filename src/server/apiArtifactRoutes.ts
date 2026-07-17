/**
 * HTTP routes for generated OpenAPI specs, MongoDB validator schemas, and Swagger UI.
 */

import type { Express, Request, Response, RequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import swaggerUi from 'swagger-ui-express';
import {
  getActiveApiArtifacts,
  readJsonArtifact,
  readJsonObjectArtifact,
  serializeApiArtifactBundle,
  type ApiArtifactBundle,
} from './apiArtifactStore.js';
import { requireRole, promoteQueryAccessToken, authenticateSwaggerDocsAccess } from './auth.js';
import { getRequestTenantId } from './tenant.js';

const docsRoleCheck = requireRole(['admin', 'developer', 'manager']).slice(1);

const docsAuth: RequestHandler[] = [
  promoteQueryAccessToken,
  authenticateSwaggerDocsAccess,
  ...docsRoleCheck,
];

function resolveBundle(req: Request, rootDir: string): ApiArtifactBundle | null {
  const tenantId = getRequestTenantId(req);
  const defaultOutDir = join(rootDir, 'out', 'tenants', tenantId, 'ui-export');
  return getActiveApiArtifacts(defaultOutDir, tenantId);
}

function findCollection(bundle: ApiArtifactBundle, name: string) {
  return bundle.collections.find((collection) => collection.name === name);
}

function readCombinedOpenApiSpec(req: Request, rootDir: string): Record<string, unknown> | null {
  const bundle = resolveBundle(req, rootDir);
  if (!bundle) return null;
  return readJsonObjectArtifact(bundle.combinedOpenApiPath);
}

export function registerApiArtifactRoutes(app: Express, rootDir: string): void {
  app.get('/api/artifacts', (req, res) => {
    const bundle = resolveBundle(req, rootDir);
    if (!bundle) {
      res.status(404).json({
        error: 'No API artifacts found. Run design, AI Migration Export, or the full pipeline first.',
      });
      return;
    }
    res.json(serializeApiArtifactBundle(bundle));
  });

  app.get('/api/artifacts/openapi.json', (req, res) => {
    const bundle = resolveBundle(req, rootDir);
    if (!bundle) {
      res.status(404).json({ error: 'Combined OpenAPI spec not found.' });
      return;
    }
    res.type('application/json').send(readJsonArtifact(bundle.combinedOpenApiPath));
  });

  app.get('/api/artifacts/openapi/:collectionName', (req, res) => {
    const bundle = resolveBundle(req, rootDir);
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
    const bundle = resolveBundle(req, rootDir);
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

  app.use('/api/docs', promoteQueryAccessToken, swaggerUi.serve);
  app.get('/api/docs/', (req, res) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, `/api/docs${query}`);
  });
  app.get('/api/docs', ...docsAuth, (req, res, next) => {
    const spec = readCombinedOpenApiSpec(req, rootDir);
    if (!spec) {
      res.status(404).type('text/plain').send('Combined OpenAPI spec not found.');
      return;
    }
    return swaggerUi.setup(spec, {
      customSiteTitle: 'hvyMETL Migration API',
      swaggerOptions: { persistAuthorization: true },
    })(req, res, next);
  });

  app.get('/api/docs/openapi.json', ...docsAuth, (req, res) => {
    const spec = readCombinedOpenApiSpec(req, rootDir);
    if (!spec) {
      res.status(404).json({ error: 'Combined OpenAPI spec not found.' });
      return;
    }
    res.json(spec);
  });
}
