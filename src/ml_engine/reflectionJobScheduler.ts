import { bootstrapAtlasMetricsConnector } from './atlasApiMetrics.js';
import { reflectPendingMigrationLogs } from './reflectPending.js';
import type { ReflectionJobDocument, ReflectionJobRunSummary } from './reflectionJobTypes.js';
import { REFLECTION_SCHEDULE_INTERVAL_MS, computeNextRunAt } from './reflectionJobTypes.js';
import type { ReflectionJobStore } from './reflectionJobStore.js';
import { getMigrationStore } from './migrationStore.js';

/** Prepares tenant-scoped migration store before a scheduled reflection tick. */
export type ReflectionTenantStorePreparer = (
  tenantId: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type ReflectionJobRuntime = {
  prepareTenantStore: ReflectionTenantStorePreparer;
};

/** Executes one scheduler tick for a reflection job (Atlas metrics + pending logs). */
export async function executeReflectionJobTick(
  job: ReflectionJobDocument,
  runtime: ReflectionJobRuntime,
): Promise<ReflectionJobRunSummary> {
  const prepared = await runtime.prepareTenantStore(job.tenantId);
  if (!prepared.ok) {
    return {
      processed: 0,
      lessonsPersisted: 0,
      errors: [prepared.error],
      finishedAt: new Date().toISOString(),
    };
  }

  bootstrapAtlasMetricsConnector(process.env);
  const store = getMigrationStore();
  const result = await reflectPendingMigrationLogs({
    store,
    minAgeMs: job.minAgeMs,
  });

  return {
    processed: result.processed,
    lessonsPersisted: result.lessonsPersisted,
    errors: result.errors,
    finishedAt: new Date().toISOString(),
  };
}

/** Persists run metadata and next run time after a tick completes. */
export async function recordReflectionJobRun(
  jobStore: ReflectionJobStore,
  job: ReflectionJobDocument,
  summary: ReflectionJobRunSummary,
): Promise<ReflectionJobDocument> {
  return jobStore.updateJob(job.tenantId, job.jobId, {
    lastRunAt: summary.finishedAt,
    lastRunSummary: summary,
    nextRunAt: computeNextRunAt(job.schedule),
    updatedAt: new Date().toISOString(),
  });
}

/** In-process interval scheduler for studio reflection jobs (single API instance). */
export class ReflectionJobScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private runningTicks = new Set<string>();

  constructor(
    private readonly jobStore: ReflectionJobStore,
    private readonly runtime: ReflectionJobRuntime,
  ) {}

  /** Resume all running jobs from the job store (API startup). */
  async hydrateRunningJobs(): Promise<void> {
    const jobs = await this.jobStore.listRunningJobs();
    for (const job of jobs) {
      this.armInterval(job);
    }
    if (jobs.length > 0) {
      console.info(`[ml_engine/reflectionJobScheduler] Hydrated ${jobs.length} running reflection job(s).`);
    }
  }

  /** Start interval timer for a running job document. */
  start(job: ReflectionJobDocument): void {
    this.stop(job.jobId);
    if (job.status !== 'running') return;
    this.armInterval(job);
  }

  /** Stop interval timer without deleting the job. */
  stop(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(jobId);
    }
  }

  /** Stop timer and remove job from store. */
  async destroy(tenantId: string, jobId: string): Promise<void> {
    this.stop(jobId);
    await this.jobStore.deleteJob(tenantId, jobId);
  }

  private armInterval(job: ReflectionJobDocument): void {
    const tickMs = REFLECTION_SCHEDULE_INTERVAL_MS[job.schedule];

    const timer = setInterval(() => {
      void this.runTick(job.jobId, job.tenantId);
    }, tickMs);
    this.timers.set(job.jobId, timer);

    void this.jobStore.updateJob(job.tenantId, job.jobId, {
      nextRunAt: computeNextRunAt(job.schedule),
    });

    setTimeout(() => {
      void this.runTick(job.jobId, job.tenantId);
    }, 2_000);
  }

  private async runTick(jobId: string, tenantId: string): Promise<void> {
    if (this.runningTicks.has(jobId)) return;
    this.runningTicks.add(jobId);
    try {
      const job = await this.jobStore.findJob(tenantId, jobId);
      if (!job || job.status !== 'running') {
        this.stop(jobId);
        return;
      }
      const summary = await executeReflectionJobTick(job, this.runtime);
      await recordReflectionJobRun(this.jobStore, job, summary);
      if (summary.errors.length > 0) {
        console.warn(
          `[ml_engine/reflectionJobScheduler] Job ${jobId} completed with ${summary.errors.length} error(s).`,
        );
      }
    } catch (error) {
      console.error(`[ml_engine/reflectionJobScheduler] Job ${jobId} tick failed: ${String(error)}`);
    } finally {
      this.runningTicks.delete(jobId);
    }
  }
}
