import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Resolve the static Terms and Conditions HTML page from web/public. */
export function loadTermsPageHtml(rootDir: string): string {
  const termsPath = join(rootDir, 'web', 'public', 'terms.html');
  if (!existsSync(termsPath)) {
    throw new Error(`Terms page not found at ${termsPath}`);
  }
  return readFileSync(termsPath, 'utf8');
}
