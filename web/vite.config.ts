import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.HVYMETL_UI_PORT ?? '3847';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/terms': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});