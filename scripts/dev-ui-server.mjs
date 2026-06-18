/**
 * Start Migration Studio in dev mode (Vite middleware on the same port as the API).
 * Sets HVYMETL_DEV_PROXY without relying on cross-env.
 */
process.env.HVYMETL_DEV_PROXY = '1';

await import('../dist/server/index.js');
