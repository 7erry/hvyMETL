import { describe, expect, it } from 'vitest';
import { buildStudioPlatformOpenApiSpec, resolveOpenApiSpecForDocs } from './studioPlatformOpenApi.js';

describe('studioPlatformOpenApi', () => {
  it('provides a non-empty fallback spec', () => {
    const spec = buildStudioPlatformOpenApiSpec();
    expect(spec.openapi).toBe('3.0.3');
    expect(Object.keys(spec.paths as object).length).toBeGreaterThan(3);
  });

  it('prefers tenant spec when available', () => {
    const tenant = { openapi: '3.0.3', info: { title: 'Tenant', version: '1' }, paths: {} };
    expect(resolveOpenApiSpecForDocs(tenant)).toBe(tenant);
    expect(resolveOpenApiSpecForDocs(null).info).toMatchObject({ title: 'hvyMETL Migration Studio API' });
  });
});
