import { EventEmitter } from 'node:events';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMongoShellRouter } from './mongoShellRoutes.js';
import * as runner from './mongoShellRunner.js';
import type { MongoshSpawnFn } from './mongoShellRunner.js';

function fakeSpawnSuccess(stdout: string): MongoshSpawnFn {
  return () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(stdout));
      child.emit('close', 0);
    });
    return child;
  };
}

describe('mongoShellRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HVYMETL_HOSTED;
    delete process.env.HVYMETL_HOSTED_URL;
  });

  async function withServer(
    run: (base: string) => Promise<void>,
  ): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use('/api/mongosh', createMongoShellRouter());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      await run(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  it('GET /status returns unavailable when mongosh is missing', async () => {
    vi.spyOn(runner, 'getMongoshStatus').mockResolvedValue({
      available: false,
      error: 'mongosh not found. Install MongoDB Shell and ensure it is on PATH, or set HVYMETL_MONGOSH_PATH.',
    });

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/mongosh/status`);
      const body = (await res.json()) as { available: boolean; error?: string };
      expect(res.status).toBe(200);
      expect(body.available).toBe(false);
      expect(body.error).toMatch(/mongosh not found/i);
    });
  });

  it('POST /run returns 503 when mongosh is missing', async () => {
    vi.spyOn(runner, 'getMongoshStatus').mockResolvedValue({
      available: false,
      error: 'mongosh not found',
    });

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/mongosh/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uri: 'mongodb+srv://user:pass@cluster.mongodb.net',
          script: 'db.runCommand({ ping: 1 })',
        }),
      });
      const body = (await res.json()) as { error?: string };
      expect(res.status).toBe(503);
      expect(body.error).toMatch(/mongosh/i);
    });
  });

  it('POST /run rejects loopback URI on hosted', async () => {
    process.env.HVYMETL_HOSTED = '1';
    vi.spyOn(runner, 'getMongoshStatus').mockResolvedValue({
      available: true,
      path: 'mongosh',
      version: '2.0.0',
    });

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/mongosh/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uri: 'mongodb://127.0.0.1:27017',
          script: 'db.runCommand({ ping: 1 })',
        }),
      });
      const body = (await res.json()) as { error?: string };
      expect(res.status).toBe(400);
      expect(body.error).toMatch(/not allowed/i);
    });
  });

  it('POST /run returns stdout when mongosh succeeds', async () => {
    vi.spyOn(runner, 'getMongoshStatus').mockResolvedValue({
      available: true,
      path: 'mongosh',
      version: '2.0.0',
    });
    vi.spyOn(runner, 'runMongoshScript').mockResolvedValue({
      ok: true,
      stdout: '{ ok: 1 }',
      stderr: '',
      exitCode: 0,
    });

    await withServer(async (base) => {
      const res = await fetch(`${base}/api/mongosh/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          uri: 'mongodb+srv://user:pass@cluster.mongodb.net',
          script: 'db.runCommand({ ping: 1 })',
        }),
      });
      const body = (await res.json()) as { ok: boolean; stdout: string };
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.stdout).toContain('ok: 1');
    });
  });

  it('runMongoshScript uses injected spawn', async () => {
    const result = await runner.runMongoshScript({
      uri: 'mongodb://localhost:27017',
      script: 'print("hi")',
      binaryPath: 'mongosh',
      spawnFn: fakeSpawnSuccess('hi\n'),
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('hi');
  });
});
