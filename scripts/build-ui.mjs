#!/usr/bin/env node
/**
 * Build server TypeScript and the Vite web UI with visible step progress.
 * Skips web npm install when lockfile and node_modules are already in sync.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');

const buildEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
};

function log(message) {
  console.log(`[build:ui] ${message}`);
}

function run(command, args, cwd = root) {
  log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: buildEnv,
  });
  if (result.error) {
    console.error(`[build:ui] Failed to start ${command}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function walkSourceFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walkSourceFiles(path, files);
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function sourceImportsLegacyHighlighter() {
  const srcDir = join(web, 'src');
  if (!existsSync(srcDir)) {
    return false;
  }
  return walkSourceFiles(srcDir).some((file) => readFileSync(file, 'utf8').includes('react-syntax-highlighter'));
}

function hasLegacyHighlighterPackage() {
  return existsSync(join(web, 'node_modules', 'react-syntax-highlighter', 'package.json'));
}

function needsWebInstall() {
  if (hasLegacyHighlighterPackage()) {
    return true;
  }

  const vitePackage = join(web, 'node_modules', 'vite', 'package.json');
  if (!existsSync(vitePackage)) {
    return true;
  }

  const lockPath = join(web, 'package-lock.json');
  const markerPath = join(web, 'node_modules', '.package-lock.json');
  if (!existsSync(lockPath) || !existsSync(markerPath)) {
    return true;
  }

  return statSync(lockPath).mtimeMs > statSync(markerPath).mtimeMs;
}

if (sourceImportsLegacyHighlighter()) {
  console.error(
    '[build:ui] This tree still imports react-syntax-highlighter (~1444 Vite modules, hangs while minifying).\n'
      + 'Apply the PrismCodeBlock migration in web/src, then reinstall web deps:\n'
      + '  cd web && rm -rf node_modules && npm install --include=dev',
  );
  process.exit(1);
}

log('Step 1/3 — compiling server TypeScript…');
run('npx', ['tsc', '-p', 'tsconfig.json']);

if (needsWebInstall()) {
  log('Step 2/3 — installing web dependencies…');
  run('npm', ['install', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'], web);
} else {
  log('Step 2/3 — web dependencies up to date (skipping npm install)');
}

log('Step 3/3 — building web UI with Vite (expect ~642 modules, not 1444)…');
log('Minifying split chunks — progress lines appear as each chunk renders…');
run('node', ['scripts/vite-build.mjs'], web);

log('Done.');
