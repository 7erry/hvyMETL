/**
 * PM2 process config for https://hvymetl.studio
 *
 * Always deploy with: npm run pm2:deploy
 * (builds web/dist, deletes duplicate/legacy PM2 apps, starts exactly one process)
 */
module.exports = {
  apps: [
    {
      name: 'hvymetl-studio',
      script: 'dist/server/index.js',
      cwd: __dirname,
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1500M',
      listen_timeout: 120_000,
      kill_timeout: 10_000,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        HVYMETL_HOSTED: '1',
        HVYMETL_UI_PORT: 3847,
      },
    },
  ],
};
