import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection, type Db } from 'mongodb';
import {
  REFLECTION_JOBS_COLLECTION,
  type ReflectionJobDocument,
  type ReflectionJobRunSummary,
  type ReflectionJobStatus,
  type ReflectionSchedulePreset,
} from './reflectionJobTypes.js';
import { createModelSingleton } from './modelSingleton.js';
import { resolveMemoryDbName } from './migrationStore.js';

export type ReflectionJobStore = {
  createJob(input: {
    tenantId: string;
    name: string;
    schedule: ReflectionSchedulePreset;
    minAgeMs: number;
  }): Promise<ReflectionJobDocument>;
  listJobs(tenantId: string): Promise<ReflectionJobDocument[]>;
  findJob(tenantId: string, jobId: string): Promise<ReflectionJobDocument | null>;
  updateJob(
    tenantId: string,
    jobId: string,
    patch: Partial<
      Pick<
        ReflectionJobDocument,
        'name' | 'schedule' | 'status' | 'minAgeMs' | 'lastRunAt' | 'lastRunSummary' | 'nextRunAt' | 'updatedAt'
      >
    >,
  ): Promise<ReflectionJobDocument>;
  deleteJob(tenantId: string, jobId: string): Promise<void>;
  listRunningJobs(): Promise<ReflectionJobDocument[]>;
};

export class InMemoryReflectionJobStore implements ReflectionJobStore {
  private jobs = new Map<string, ReflectionJobDocument>();

  async createJob(input: {
    tenantId: string;
    name: string;
    schedule: ReflectionSchedulePreset;
    minAgeMs: number;
  }): Promise<ReflectionJobDocument> {
    const now = new Date().toISOString();
    const job: ReflectionJobDocument = {
      jobId: randomUUID(),
      tenantId: input.tenantId,
      name: input.name.trim(),
      schedule: input.schedule,
      status: 'stopped',
      minAgeMs: input.minAgeMs,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(`${input.tenantId}:${job.jobId}`, structuredClone(job));
    return structuredClone(job);
  }

  async listJobs(tenantId: string): Promise<ReflectionJobDocument[]> {
    return [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId)
      .map((job) => structuredClone(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findJob(tenantId: string, jobId: string): Promise<ReflectionJobDocument | null> {
    const found = this.jobs.get(`${tenantId}:${jobId}`);
    return found ? structuredClone(found) : null;
  }

  async updateJob(
    tenantId: string,
    jobId: string,
    patch: Partial<
      Pick<
        ReflectionJobDocument,
        'name' | 'schedule' | 'status' | 'minAgeMs' | 'lastRunAt' | 'lastRunSummary' | 'nextRunAt' | 'updatedAt'
      >
    >,
  ): Promise<ReflectionJobDocument> {
    const key = `${tenantId}:${jobId}`;
    const existing = this.jobs.get(key);
    if (!existing) throw new Error(`Reflection job not found: ${jobId}`);
    const updated = structuredClone({ ...existing, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() });
    this.jobs.set(key, updated);
    return structuredClone(updated);
  }

  async deleteJob(tenantId: string, jobId: string): Promise<void> {
    if (!this.jobs.delete(`${tenantId}:${jobId}`)) {
      throw new Error(`Reflection job not found: ${jobId}`);
    }
  }

  async listRunningJobs(): Promise<ReflectionJobDocument[]> {
    return [...this.jobs.values()]
      .filter((job) => job.status === 'running')
      .map((job) => structuredClone(job));
  }
}

type MongoJobContext = {
  client: MongoClient;
  db: Db;
  jobs: Collection<ReflectionJobDocument>;
};

const mongoJobSingleton = createModelSingleton(async (): Promise<MongoJobContext> => {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(resolveMemoryDbName(process.env));
  const jobs = db.collection<ReflectionJobDocument>(REFLECTION_JOBS_COLLECTION);
  await jobs.createIndex({ tenantId: 1, jobId: 1 }, { unique: true });
  await jobs.createIndex({ tenantId: 1, createdAt: -1 });
  await jobs.createIndex({ status: 1 });
  return { client, db, jobs };
});

class MongoReflectionJobStore implements ReflectionJobStore {
  private async ctx(): Promise<MongoJobContext> {
    return mongoJobSingleton.getInstance();
  }

  async createJob(input: {
    tenantId: string;
    name: string;
    schedule: ReflectionSchedulePreset;
    minAgeMs: number;
  }): Promise<ReflectionJobDocument> {
    const { jobs } = await this.ctx();
    const now = new Date().toISOString();
    const job: ReflectionJobDocument = {
      jobId: randomUUID(),
      tenantId: input.tenantId,
      name: input.name.trim(),
      schedule: input.schedule,
      status: 'stopped',
      minAgeMs: input.minAgeMs,
      createdAt: now,
      updatedAt: now,
    };
    await jobs.insertOne(job);
    return structuredClone(job);
  }

  async listJobs(tenantId: string): Promise<ReflectionJobDocument[]> {
    const { jobs } = await this.ctx();
    return jobs.find({ tenantId }).sort({ createdAt: -1 }).toArray();
  }

  async findJob(tenantId: string, jobId: string): Promise<ReflectionJobDocument | null> {
    const { jobs } = await this.ctx();
    return jobs.findOne({ tenantId, jobId });
  }

  async updateJob(
    tenantId: string,
    jobId: string,
    patch: Partial<
      Pick<
        ReflectionJobDocument,
        'name' | 'schedule' | 'status' | 'minAgeMs' | 'lastRunAt' | 'lastRunSummary' | 'nextRunAt' | 'updatedAt'
      >
    >,
  ): Promise<ReflectionJobDocument> {
    const { jobs } = await this.ctx();
    const updatedAt = patch.updatedAt ?? new Date().toISOString();
    const result = await jobs.findOneAndUpdate(
      { tenantId, jobId },
      { $set: { ...patch, updatedAt } },
      { returnDocument: 'after' },
    );
    if (!result) throw new Error(`Reflection job not found: ${jobId}`);
    return result;
  }

  async deleteJob(tenantId: string, jobId: string): Promise<void> {
    const { jobs } = await this.ctx();
    const result = await jobs.deleteOne({ tenantId, jobId });
    if (result.deletedCount === 0) throw new Error(`Reflection job not found: ${jobId}`);
  }

  async listRunningJobs(): Promise<ReflectionJobDocument[]> {
    const { jobs } = await this.ctx();
    return jobs.find({ status: 'running' }).toArray();
  }
}

let defaultReflectionJobStore: ReflectionJobStore | null = null;

/** Job metadata store — MongoDB when MONGODB_URI is set, otherwise in-memory (single process). */
export function getReflectionJobStore(): ReflectionJobStore {
  if (defaultReflectionJobStore) return defaultReflectionJobStore;
  if (process.env.MONGODB_URI?.trim()) {
    defaultReflectionJobStore = new MongoReflectionJobStore();
  } else {
    defaultReflectionJobStore = new InMemoryReflectionJobStore();
    console.info('[ml_engine/reflectionJobStore] MONGODB_URI unset — using in-memory reflection jobs.');
  }
  return defaultReflectionJobStore;
}

export function setReflectionJobStore(store: ReflectionJobStore | null): void {
  defaultReflectionJobStore = store;
}

export function resetReflectionJobStoreSingleton(): void {
  mongoJobSingleton.reset();
  defaultReflectionJobStore = null;
}
