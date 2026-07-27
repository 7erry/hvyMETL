/**
 * Writes examples/dialects/* from the deterministic dialect pattern manifest.
 * Run: npx tsx scripts/generate-dialect-examples.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALECT_PATTERN_MANIFEST } from '../src/examples/dialectPatternManifest.ts';
import { renderDialectExampleFile } from '../src/examples/dialectExampleTemplates.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'examples', 'dialects');

mkdirSync(OUT_DIR, { recursive: true });

for (const entry of DIALECT_PATTERN_MANIFEST) {
  const contents = renderDialectExampleFile(entry.dialectId, entry.pattern);
  writeFileSync(join(OUT_DIR, entry.fileName), contents, 'utf8');
  console.log(`wrote ${entry.fileName} (${entry.pattern})`);
}

console.log(`Generated ${DIALECT_PATTERN_MANIFEST.length} dialect examples.`);
