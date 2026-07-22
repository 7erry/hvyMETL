/**
 * Idempotent hosted deploy: build web/dist, remove duplicate PM2 processes, start exactly one studio server.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_NAME = 'hvymetl-studio';
const LEGACY_NAMES = ['hvymetl', 'hvyMETL', 'hvymetl-ui', 'dev-ui-server', 'index', 'server'];

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HVYMETL_HOSTED: '1',
    },
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function pm2(...args) {
  run('pm2', args);
}

function pm2List() {
  const result = spawnSync('pm2', ['jlist'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout?.trim()) return [];
  try {
    return JSON.parse(result.stdout);
  } catch {
    return [];
  }
}

function deleteProcess(name) {
  console.log(`Removing PM2 process: ${name}`);
  spawnSync('pm2', ['delete', name], { cwd: root, stdio: 'inherit' });
}

console.log('[pm2:deploy] Building API + web/dist...');
run('npm', ['run', '-s', 'build:ui']);

console.log('[pm2:deploy] Cleaning duplicate / legacy PM2 processes...');
const processes = pm2List();
const names = new Set(processes.map((proc) => proc.name));

for (const legacy of LEGACY_NAMES) {
  if (names.has(legacy)) deleteProcess(legacy);
}

const studioProcesses = processes.filter((proc) => proc.name === APP_NAME);
if (studioProcesses.length > 0) {
  deleteProcess(APP_NAME);
}

console.log('[pm2:deploy] Starting single studio process...');
pm2('start', 'ecosystem.config.cjs', '--update-env');
pm2('save');

console.log('\n[pm2:deploy] PM2 status:');
pm2('status');

console.log('\n[pm2:deploy] Verify locally:');
console.log('  curl -s http://127.0.0.1:3847/api/health');
console.log('  curl -s http://127.0.0.1:3847/ | grep assets');
