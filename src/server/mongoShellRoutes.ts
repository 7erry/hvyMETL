/**
 * Express routes for one-shot mongosh script execution.
 */

import { Router } from 'express';
import { isHostedStudioRequest } from './hosted.js';
import { assertRequestMongoUri } from './pipelineCredentials.js';
import { getMongoshStatus, runMongoshScript } from './mongoShellRunner.js';

export function createMongoShellRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const status = await getMongoshStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ available: false, error: String(error) });
    }
  });

  router.post('/run', async (req, res) => {
    try {
      let uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
      const script = typeof req.body?.script === 'string' ? req.body.script : '';
      const dbName = typeof req.body?.dbName === 'string' ? req.body.dbName.trim() : undefined;
      const findLimitRaw = req.body?.findLimit;
      const findLimit =
        typeof findLimitRaw === 'number'
          ? findLimitRaw
          : typeof findLimitRaw === 'string' && findLimitRaw.trim()
            ? Number(findLimitRaw)
            : undefined;

      if (!uri) {
        res.status(400).json({ error: 'MongoDB URI is required.' });
        return;
      }
      if (!script.trim()) {
        res.status(400).json({ error: 'Script is required.' });
        return;
      }

      if (isHostedStudioRequest(req)) {
        try {
          uri = assertRequestMongoUri(uri);
        } catch (error) {
          res.status(400).json({ error: String((error as Error).message ?? error) });
          return;
        }
      }

      const status = await getMongoshStatus();
      if (!status.available) {
        res.status(503).json({
          error: status.error ?? 'mongosh is not available on this server.',
        });
        return;
      }

      const result = await runMongoshScript({
        uri,
        script,
        dbName: dbName || undefined,
        findLimit: Number.isFinite(findLimit) ? findLimit : undefined,
        binaryPath: status.path,
      });
      res.json(result);
    } catch (error) {
      const message = String((error as Error).message ?? error);
      if (/mongosh not found|HVYMETL_MONGOSH_PATH/i.test(message)) {
        res.status(503).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  return router;
}
