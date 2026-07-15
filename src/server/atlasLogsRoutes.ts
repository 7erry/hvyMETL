/**
 * Express routes for MongoDB Atlas project events and database logs.
 */

import { Router, type Response } from 'express';
import {
  fetchAtlasDatabaseLogs,
  fetchAtlasProjectEvents,
  getAtlasLogsStatus,
  isAtlasLogFileName,
  readAtlasLogsConfig,
} from '../utilities/atlasLogs.js';

function atlasConfigOrError(res: Response) {
  const config = readAtlasLogsConfig();
  if (!config) {
    res.status(503).json({
      error: 'Atlas logs are not configured. Set ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET, and ATLAS_GROUP_ID in .env.',
    });
    return null;
  }
  return config;
}

export function createAtlasLogsRouter(): Router {
  const router = Router();

  router.get('/logs/status', (_req, res) => {
    res.json(getAtlasLogsStatus());
  });

  router.get('/logs/events', async (req, res) => {
    try {
      const config = atlasConfigOrError(res);
      if (!config) return;

      const itemsPerPage = Number.parseInt(String(req.query.itemsPerPage ?? '20'), 10);
      const pageNum = Number.parseInt(String(req.query.pageNum ?? '1'), 10);
      const result = await fetchAtlasProjectEvents(config, {
        itemsPerPage: Number.isFinite(itemsPerPage) ? itemsPerPage : 20,
        pageNum: Number.isFinite(pageNum) ? pageNum : 1,
      });
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  router.get('/logs/database', async (req, res) => {
    try {
      const config = atlasConfigOrError(res);
      if (!config) return;

      const logNameRaw = String(req.query.logName ?? 'mongodb.gz');
      const logName = isAtlasLogFileName(logNameRaw) ? logNameRaw : 'mongodb.gz';
      const maxLines = Number.parseInt(String(req.query.maxLines ?? '100'), 10);
      const hostName = String(req.query.hostName ?? '').trim() || config.hostName;

      const result = await fetchAtlasDatabaseLogs(config, {
        logName,
        maxLines: Number.isFinite(maxLines) ? maxLines : 100,
        hostName,
      });
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  router.get('/logs/snapshot', async (req, res) => {
    try {
      const config = atlasConfigOrError(res);
      if (!config) return;

      const itemsPerPage = Number.parseInt(String(req.query.itemsPerPage ?? '15'), 10);
      const maxLogLines = Number.parseInt(String(req.query.maxLogLines ?? '50'), 10);
      const includeDatabaseLogs = req.query.includeDatabaseLogs !== 'false' && Boolean(config.hostName);
      const logNameRaw = String(req.query.logName ?? 'mongodb.gz');
      const logName = isAtlasLogFileName(logNameRaw) ? logNameRaw : 'mongodb.gz';

      const events = await fetchAtlasProjectEvents(config, {
        itemsPerPage: Number.isFinite(itemsPerPage) ? itemsPerPage : 15,
      });

      let databaseLogs;
      if (includeDatabaseLogs) {
        databaseLogs = await fetchAtlasDatabaseLogs(config, {
          logName,
          maxLines: Number.isFinite(maxLogLines) ? maxLogLines : 50,
        });
      }

      res.json({
        status: getAtlasLogsStatus(),
        events,
        databaseLogs,
      });
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  return router;
}
