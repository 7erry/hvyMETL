import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve the static Help HTML page from web/public. */
export function loadHelpPageHtml(rootDir: string): string {
  const helpPath = join(rootDir, 'web', 'public', 'help.html');
  if (!existsSync(helpPath)) {
    throw new Error(`Help page not found at ${helpPath}`);
  }
  return readFileSync(helpPath, 'utf8');
}
