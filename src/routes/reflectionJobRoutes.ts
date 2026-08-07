import { Router, type Request } from 'express';
import {
  computeNextRunAt,
  parseReflectionSchedulePreset,
  type ReflectionSchedulePreset,
} from '../ml_engine/reflectionJobTypes.js';
import type { ReflectionJobScheduler } from '../ml_engine/reflectionJobScheduler.js';
import { getReflectionJobStore } from '../ml_engine/reflectionJobStore.js';
import { getRequestTenantId } from '../server/tenant.js';

export type ReflectionJobRouterOptions = {
  scheduler: ReflectionJobScheduler;
};

function parseMinAgeMs(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return Number(process.env.HVYMETL_REFLECTION_DELAY_MS ?? 0) || 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function tenantIdFromRequest(req: Request): string {
  return getRequestTenantId(req);
}

/** HTTP API for studio scheduled ML reflection jobs. */
export function createReflectionJobRouter(options: ReflectionJobRouterOptions): Router {
  const router = Router();
  const jobStore = getReflectionJobStore();

  router.get('/', async (req, res) => {
    try {
      const tenantId = tenantIdFromRequest(req);
      const jobs = await jobStore.listJobs(tenantId);
      res.json({ jobs });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const tenantId = tenantIdFromRequest(req);
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const schedule = parseReflectionSchedulePreset(body.schedule);
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (!schedule) {
        res.status(400).json({ error: 'schedule must be hourly, daily, or weekly' });
        return;
      }
      const minAgeMs = parseMinAgeMs(body.minAgeMs);
      const job = await jobStore.createJob({ tenantId, name, schedule, minAgeMs });
      res.status(201).json({ job });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/:jobId/start', async (req, res) => {
    try {
      const tenantId = tenantIdFromRequest(req);
      const jobId = String(req.params.jobId);
      const existing = await jobStore.findJob(tenantId, jobId);
      if (!existing) {
        res.status(404).json({ error: 'Reflection job not found' });
        return;
      }
      const job = await jobStore.updateJob(tenantId, jobId, {
        status: 'running',
        nextRunAt: computeNextRunAt(existing.schedule),
      });
      options.scheduler.start(job);
      res.json({ job });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post('/:jobId/stop', async (req, res) => {
    try {
      const tenantId = tenantIdFromRequest(req);
      const jobId = String(req.params.jobId);
      const existing = await jobStore.findJob(tenantId, jobId);
      if (!existing) {
        res.status(404).json({ error: 'Reflection job not found' });
        return;
      }
      options.scheduler.stop(jobId);
      const job = await jobStore.updateJob(tenantId, jobId, { status: 'stopped', nextRunAt: undefined });
      res.json({ job });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.delete('/:jobId', async (req, res) => {
    try {
      const tenantId = tenantIdFromRequest(req);
      const jobId = String(req.params.jobId);
      await options.scheduler.destroy(tenantId, jobId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}

export type { ReflectionSchedulePreset };
