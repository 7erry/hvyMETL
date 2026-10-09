import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve the static architecture diagram HTML from web/public. */
export function loadArchitecturePageHtml(rootDir: string): string {
  const pagePath = join(rootDir, 'web', 'public', 'architecture.html');
  if (!existsSync(pagePath)) {
    throw new Error(`Architecture diagram not found at ${pagePath}`);
  }
  return readFileSync(pagePath, 'utf8');
}
