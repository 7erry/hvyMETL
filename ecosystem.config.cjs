/**
 * PM2 process config for https://hvymetl.studio
 *
 * Deploy:
 *   git pull
 *   npm run pm2:deploy
 *
 * First boot:
 *   npm run pm2:start
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
      env: {
        NODE_ENV: 'production',
        HVYMETL_HOSTED: '1',
        HVYMETL_UI_PORT: 3847,
      },
    },
  ],
};
