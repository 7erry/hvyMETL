/**
 * Validate generated OpenAPI documents under an output directory.
 * Usage: node scripts/validate-collection-openapi.mjs out/iot
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/validate-collection-openapi.mjs <out-dir>');
  process.exit(1);
}

function listOpenApiFiles(root) {
  const files = [];
  const openapiDir = join(root, 'openapi');
  if (statSync(openapiDir).isDirectory()) {
    for (const name of readdirSync(openapiDir)) {
      if (name.endsWith('.openapi.json')) files.push(join(openapiDir, name));
    }
  }
  const combined = join(root, 'openapi.json');
  if (statSync(combined).isFile()) files.push(combined);
  return files;
}

function validateOpenApi(doc, label) {
  const errors = [];
  if (doc.openapi !== '3.0.3') errors.push('missing or invalid openapi version');
  if (!doc.info?.title) errors.push('missing info.title');
  if (!doc.paths || typeof doc.paths !== 'object') errors.push('missing paths');
  if (!doc.components?.schemas) errors.push('missing components.schemas');
  const pathCount = Object.keys(doc.paths ?? {}).length;
  if (pathCount === 0) errors.push('paths is empty');

  for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathKey.startsWith('/')) errors.push(`path ${pathKey} must start with /`);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation?.responses) errors.push(`${pathKey} ${method} missing responses`);
    }
  }

  return { label, ok: errors.length === 0, errors, pathCount };
}

const schemaDir = join(outDir, 'schemas');
let schemaCount = 0;
if (statSync(schemaDir).isDirectory()) {
  for (const name of readdirSync(schemaDir)) {
    if (!name.endsWith('.schema.json')) continue;
    schemaCount += 1;
    const raw = readFileSync(join(schemaDir, name), 'utf8');
    const doc = JSON.parse(raw);
    if (!doc.validator?.$jsonSchema) {
      console.error(`FAIL  schema ${name} — missing validator.$jsonSchema`);
      process.exitCode = 1;
    }
  }
}

const results = listOpenApiFiles(outDir).map((file) => {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  return validateOpenApi(doc, file);
});

let failed = 0;
for (const result of results) {
  if (result.ok) {
    console.log(`PASS  ${result.label} (${result.pathCount} paths)`);
  } else {
    failed += 1;
    console.error(`FAIL  ${result.label}`);
    for (const err of result.errors) console.error(`      ${err}`);
  }
}

console.log(`Schemas: ${schemaCount} | OpenAPI files: ${results.length} | Failed: ${failed}`);
if (failed > 0) process.exit(1);
