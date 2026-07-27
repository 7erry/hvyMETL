import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.HVYMETL_UI_PORT ?? '3847';

/** Log chunk render/minify progress — "rendering chunks (N)" can look stuck without output. */
function buildProgressPlugin() {
  let chunkCount = 0;

  return {
    name: 'hvymetl-build-progress',
    renderStart() {
      chunkCount = 0;
      console.log('[vite] rendering chunks…');
    },
    renderChunk(_code: string, chunk: { fileName: string }) {
      chunkCount += 1;
      console.log(`[vite] rendering chunks (${chunkCount}) — ${chunk.fileName}`);
      return null;
    },
    closeBundle() {
      console.log(`[vite] finished rendering ${chunkCount} chunk(s)`);
    },
  };
}

function isNodeModule(id: string, segment: string): boolean {
  return id.includes(`node_modules/${segment}`);
}

export default defineConfig({
  plugins: [react(), buildProgressPlugin()],
  build: {
    sourcemap: false,
    reportCompressedSize: false,
    minify: 'esbuild',
    cssMinify: 'esbuild',
    rollupOptions: {
      maxParallelFileOps: 1,
      output: {
        manualChunks(id) {
          if (
            isNodeModule(id, 'react/')
            || isNodeModule(id, 'react-dom/')
            || isNodeModule(id, 'scheduler/')
          ) {
            return 'vendor-react';
          }
          if (isNodeModule(id, '@xyflow/react') || isNodeModule(id, '@xyflow/system')) {
            return 'xyflow';
          }
          if (
            isNodeModule(id, 'react-markdown')
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
            isNodeModule(id, 'prismjs')
            || isNodeModule(id, 'react-simple-code-editor')
            || isNodeModule(id, 'react-syntax-highlighter')
            || isNodeModule(id, 'refractor')
          ) {
            return 'prism';
          }
          if (isNodeModule(id, '@auth0/auth0-react')) {
            return 'auth0';
          }
          if (isNodeModule(id, 'fflate')) {
            return 'vendor-fflate';
          }
          if (id.includes('/src/copilot/') || id.includes('\\src\\copilot\\')) {
            return 'copilot';
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
