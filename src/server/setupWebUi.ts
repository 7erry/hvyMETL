/**
 * Mount the Migration Studio UI on Express — Vite dev middleware or static dist.
 */

import express, { type Express } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASSET_PATH = /\.(js|mjs|css|map|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|json|txt|webp)$/i;

export type WebUiMode = 'vite' | 'static' | 'not-built';

function notBuiltPage(): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;background:#112733;color:#e3fcf7">
    <h1>hvyMETL UI not built</h1>
    <p>Run <code>npm run build:ui</code> or <code>npm run dev:ui</code> from the repo root.</p>
    <p>API is available at <a href="/api/health" style="color:#00ed64">/api/health</a> and
    <a href="/api/docs" style="color:#00ed64">/api/docs</a> (Swagger UI).</p>
  </body></html>`;
}

/** True when web/dist has index.html and the main bundle referenced in it exists. */
function isDistBuildValid(webDist: string): boolean {
  const indexPath = join(webDist, 'index.html');
  if (!existsSync(indexPath)) return false;

  const html = readFileSync(indexPath, 'utf8');
  const scriptMatch = html.match(/src="(\/[^"]+)"/);
  if (scriptMatch) {
    const assetPath = join(webDist, scriptMatch[1].replace(/^\//, ''));
    if (!existsSync(assetPath)) return false;
  }

  return true;
}

function shouldServeWithVite(devMode: boolean, webDist: string): boolean {
  if (devMode) return true;
  if (!isDistBuildValid(webDist)) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

function mountSpaFallback(
  app: Express,
  webDist: string,
): void {
  app.use(express.static(webDist, { index: false, fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    if (ASSET_PATH.test(req.path)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    res.sendFile(join(webDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

/** Attach Vite (dev) or web/dist (production) so non-API routes render the React app. */
export async function mountWebUi(app: Express, rootDir: string, devMode: boolean): Promise<WebUiMode> {
  const webRoot = join(rootDir, 'web');
  const webDist = join(webRoot, 'dist');

  if (shouldServeWithVite(devMode, webDist)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: webRoot,
      configFile: join(webRoot, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const url = req.originalUrl;
      if (url.startsWith('/api')) return next();

      try {
        const template = readFileSync(join(webRoot, 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).type('html').send(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });

    return 'vite';
  }

  if (isDistBuildValid(webDist)) {
    mountSpaFallback(app, webDist);
    return 'static';
  }

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.status(503).type('html').send(notBuiltPage());
  });
  return 'not-built';
}
