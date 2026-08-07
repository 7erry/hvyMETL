import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReflectionJobRouter } from './reflectionJobRoutes.js';
import { ReflectionJobScheduler } from '../ml_engine/reflectionJobScheduler.js';
import {
  InMemoryReflectionJobStore,
  setReflectionJobStore,
} from '../ml_engine/reflectionJobStore.js';

describe('reflection job routes', () => {
  let jobStore: InMemoryReflectionJobStore;
  let scheduler: ReflectionJobScheduler;

  beforeEach(() => {
    jobStore = new InMemoryReflectionJobStore();
    setReflectionJobStore(jobStore);
    scheduler = new ReflectionJobScheduler(jobStore, {
      prepareTenantStore: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    setReflectionJobStore(null);
  });

  async function request(method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.use('/api/reflection-jobs', createReflectionJobRouter({ scheduler }));
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body: parsed };
  }

  it('creates, starts, stops, and destroys a job', async () => {
    const create = await request('POST', '/api/reflection-jobs', {
      name: 'Nightly reflection',
      schedule: 'daily',
      minAgeMs: 3600000,
    });
    expect(create.status).toBe(201);
    const jobId = (create.body.job as { jobId: string }).jobId;

    const start = await request('POST', `/api/reflection-jobs/${jobId}/start`);
    expect(start.status).toBe(200);
    expect((start.body.job as { status: string }).status).toBe('running');

    const stop = await request('POST', `/api/reflection-jobs/${jobId}/stop`);
    expect(stop.status).toBe(200);
    expect((stop.body.job as { status: string }).status).toBe('stopped');

    const destroy = await request('DELETE', `/api/reflection-jobs/${jobId}`);
    expect(destroy.status).toBe(204);

    const list = await request('GET', '/api/reflection-jobs');
    expect((list.body.jobs as unknown[]).length).toBe(0);
  });
});
