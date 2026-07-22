/**
 * Production entry for https://hvymetl.studio — builds static web/dist and never enables Vite dev mode.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDistIndex = join(root, 'web/dist/index.html');

process.env.NODE_ENV = process.env.NODE_ENV?.trim() || 'production';
process.env.HVYMETL_HOSTED = '1';
delete process.env.HVYMETL_DEV_PROXY;

if (!existsSync(webDistIndex) || process.env.HVYMETL_FORCE_UI_BUILD === '1') {
  console.log('[start:hosted] Building Migration Studio UI (web/dist)...');
  const build = spawnSync('npm', ['run', '-s', 'build:ui'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

await import('../dist/server/index.js');
