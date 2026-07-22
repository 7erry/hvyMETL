import express from 'express';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { registerApiArtifactRoutes } from './apiArtifactRoutes.js';
import { registerApiArtifacts, resetApiArtifactStore } from './apiArtifactStore.js';
import { LOCAL_DEV_TENANT_ID } from './tenant.js';

describe('registerApiArtifactRoutes', () => {
  const originalAuthDisabled = process.env.HVYMETL_AUTH_DISABLED;

  afterEach(() => {
    if (originalAuthDisabled === undefined) delete process.env.HVYMETL_AUTH_DISABLED;
    else process.env.HVYMETL_AUTH_DISABLED = originalAuthDisabled;
    resetApiArtifactStore();
  });

  async function fetchDocs(path: string): Promise<{ status: number; location: string | null; body: string }> {
    const rootDir = mkdtempSync(join(tmpdir(), 'hvymetl-swagger-'));
    const outDir = join(rootDir, 'out', 'tenants', LOCAL_DEV_TENANT_ID, 'ui-design');
    mkdirSync(join(outDir, 'openapi'), { recursive: true });
    writeFileSync(
      join(outDir, 'openapi.json'),
      `${JSON.stringify({ openapi: '3.0.3', info: { title: 'Test', version: '1.0.0' }, paths: {} })}\n`,
    );
    registerApiArtifacts(outDir, 'ui-design');

    process.env.HVYMETL_AUTH_DISABLED = '1';
    const app = express();
    registerApiArtifactRoutes(app, rootDir);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
    const body = await response.text();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    return {
      status: response.status,
      location: response.headers.get('location'),
      body,
    };
  }

  it('serves Swagger HTML at /api/docs without redirecting to /api/docs/', async () => {
    const result = await fetchDocs('/api/docs');
    expect(result.status).toBe(200);
    expect(result.location).toBeNull();
    expect(result.body).toContain('swagger-ui');
  });

  it('serves Swagger HTML at /api/docs/ without redirecting back to /api/docs', async () => {
    const result = await fetchDocs('/api/docs/');
    expect(result.status).toBe(200);
    expect(result.location).not.toBe('/api/docs');
    expect(result.body).toContain('swagger-ui');
  });

  it('preserves access_token when serving /api/docs', async () => {
    const result = await fetchDocs('/api/docs?access_token=abc123');
    expect(result.status).toBe(200);
    expect(result.location).toBeNull();
    expect(result.body).toContain('swagger-ui');
  });
});
