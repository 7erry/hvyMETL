#!/usr/bin/env node
/**
 * Production Vite build with a raised Node heap and inherited CLI args.
 * Use instead of bare `vite build` so minification does not stall on low-memory shells.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteBin)) {
  console.error('[vite-build] Missing Vite — run npm install in web/ first.');
  process.exit(1);
}

const nodeOptions = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} --max-old-space-size=4096`
  : '--max-old-space-size=4096';

console.log('[vite-build] Running Vite production build…');

const result = spawnSync(process.execPath, [viteBin, 'build', ...process.argv.slice(2)], {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

if (result.error) {
  console.error('[vite-build] Failed to start Vite:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
