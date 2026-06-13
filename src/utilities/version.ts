import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read the published package version from package.json at the repo root. */
export function readPackageVersion(): string {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
