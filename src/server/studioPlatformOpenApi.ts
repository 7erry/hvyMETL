/**
 * Fallback OpenAPI document for /api/docs when no tenant migration artifacts exist yet.
 * Migration-generated collection APIs replace this after design or pipeline export.
 */

export function buildStudioPlatformOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'hvyMETL Migration Studio API',
      version: '4.2.1',
      description:
        'Platform REST API for the Migration Studio. After you run **Refresh design**, **AI Migration Export**, or **Run Full Pipeline**, tenant-specific collection OpenAPI specs replace this document in Swagger UI.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health' },
      { name: 'Design' },
      { name: 'Pipeline' },
      { name: 'Artifacts' },
      { name: 'Reflection jobs' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'API health and UI mode',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/api/pipeline/config': {
        get: {
          tags: ['Pipeline'],
          summary: 'Pipeline configuration status (non-secret)',
          responses: { '200': { description: 'Config snapshot' } },
        },
      },
      '/api/pipeline/run': {
        post: {
          tags: ['Pipeline'],
          summary: 'Run full ML design + csvToAtlas import pipeline',
          responses: { '200': { description: 'Pipeline result' } },
        },
      },
      '/api/pipeline/executions': {
        get: {
          tags: ['Pipeline'],
          summary: 'List recent pipeline executions',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
          responses: { '200': { description: 'Execution list' } },
        },
      },
      '/api/design/run': {
        post: {
          tags: ['Design'],
          summary: 'ML-enhanced migration design from SQL model',
          responses: { '200': { description: 'Migration plan + design report' } },
        },
      },
      '/api/artifacts': {
        get: {
          tags: ['Artifacts'],
          summary: 'Latest OpenAPI + schema artifact bundle metadata',
          responses: { '200': { description: 'Artifact bundle' }, '404': { description: 'No artifacts yet' } },
        },
      },
      '/api/artifacts/openapi.json': {
        get: {
          tags: ['Artifacts'],
          summary: 'Combined OpenAPI for designed collections',
          responses: { '200': { description: 'OpenAPI JSON' }, '404': { description: 'No artifacts yet' } },
        },
      },
      '/api/reflection-jobs': {
        get: {
          tags: ['Reflection jobs'],
          summary: 'List scheduled ML reflection jobs',
          responses: { '200': { description: 'Job list' } },
        },
        post: {
          tags: ['Reflection jobs'],
          summary: 'Create a reflection job (hourly / daily / weekly)',
          responses: { '201': { description: 'Created job' } },
        },
      },
      '/api/docs/openapi.json': {
        get: {
          tags: ['Artifacts'],
          summary: 'OpenAPI document served to Swagger UI',
          responses: { '200': { description: 'OpenAPI JSON' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Auth0 access token (Migration Studio)',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

/** Tenant migration OpenAPI when present; otherwise the platform fallback spec. */
export function resolveOpenApiSpecForDocs(
  tenantSpec: Record<string, unknown> | null,
): Record<string, unknown> {
  return tenantSpec ?? buildStudioPlatformOpenApiSpec();
}
