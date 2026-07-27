import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.HVYMETL_UI_PORT ?? '3847';

/** Log when Rollup starts generating/minifying output chunks (after module transform). */
function buildProgressPlugin() {
  return {
    name: 'hvymetl-build-progress',
    generateBundle() {
      console.log('[vite] minifying output chunks…');
    },
  };
}

export default defineConfig({
  plugins: [react(), buildProgressPlugin()],
  build: {
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow/react') || id.includes('node_modules/@xyflow/system')) {
            return 'xyflow';
          }
          if (
            id.includes('node_modules/react-markdown')
            || id.includes('node_modules/remark-')
            || id.includes('node_modules/rehype-')
            || id.includes('node_modules/micromark')
            || id.includes('node_modules/mdast-')
            || id.includes('node_modules/hast-')
            || id.includes('node_modules/unist-')
          ) {
            return 'markdown';
          }
          if (
            id.includes('node_modules/prismjs')
            || id.includes('node_modules/react-simple-code-editor')
            || id.includes('node_modules/react-syntax-highlighter')
            || id.includes('node_modules/refractor')
          ) {
            return 'prism';
          }
          if (id.includes('node_modules/@auth0/auth0-react')) {
            return 'auth0';
          }
        },
      },
    },
  },
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