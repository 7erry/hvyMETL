/**
 * Typed persistence for migration logs and lessons-learned vector memory.
 * Uses MongoDB Atlas when MONGODB_URI is configured; falls back to in-process
 * storage for local development and unit tests.
 */

import { MongoClient, type Collection, type Db } from 'mongodb';
import { createModelSingleton } from './modelSingleton.js';
import {
  LESSONS_LEARNED_COLLECTION,
  MIGRATION_LOGS_COLLECTION,
  type LessonLearnedDocument,
  type MigrationLogDocument,
} from './feedbackTypes.js';
import type { PipelineExecutionDocument } from '../server/pipelineExecutionTypes.js';
import { PIPELINE_EXECUTIONS_COLLECTION } from '../server/pipelineExecutionTypes.js';

/** Abstraction so feedbackCollector and memoryEngine stay testable without Atlas. */
export type MigrationStore = {
  insertLog(document: MigrationLogDocument): Promise<void>;
  findLogByMigrationId(migrationId: string): Promise<MigrationLogDocument | null>;
  updateLog(migrationId: string, patch: Partial<MigrationLogDocument>): Promise<void>;
  upsertLesson(lesson: LessonLearnedDocument): Promise<void>;
  listLessons(namespace?: string): Promise<LessonLearnedDocument[]>;
  insertPipelineExecution(document: PipelineExecutionDocument): Promise<void>;
  findPipelineExecution(executionId: string, tenantId?: string): Promise<PipelineExecutionDocument | null>;
  listPipelineExecutions(limit?: number, tenantId?: string): Promise<PipelineExecutionDocument[]>;
};

/** In-memory store for tests and offline CLI runs without MONGODB_URI. */
export class InMemoryMigrationStore implements MigrationStore {
  private logs = new Map<string, MigrationLogDocument>();
  private lessons = new Map<string, LessonLearnedDocument>();
  private executions = new Map<string, PipelineExecutionDocument>();

  async insertLog(document: MigrationLogDocument): Promise<void> {
    this.logs.set(document.migrationId, structuredClone(document));
  }

  async findLogByMigrationId(migrationId: string): Promise<MigrationLogDocument | null> {
    const found = this.logs.get(migrationId);
    return found ? structuredClone(found) : null;
  }

  async updateLog(migrationId: string, patch: Partial<MigrationLogDocument>): Promise<void> {
    const existing = this.logs.get(migrationId);
    if (!existing) throw new Error(`Migration log not found: ${migrationId}`);
    this.logs.set(migrationId, structuredClone({ ...existing, ...patch }));
  }

  async upsertLesson(lesson: LessonLearnedDocument): Promise<void> {
    this.lessons.set(lesson.lessonId, structuredClone(lesson));
  }

  async listLessons(namespace?: string): Promise<LessonLearnedDocument[]> {
    const all = [...this.lessons.values()].map((lesson) => structuredClone(lesson));
    if (!namespace) return all;
    return all.filter((lesson) => lesson.namespace === namespace);
  }

  async insertPipelineExecution(document: PipelineExecutionDocument): Promise<void> {
    this.executions.set(document.executionId, structuredClone(document));
  }

  async findPipelineExecution(executionId: string, tenantId?: string): Promise<PipelineExecutionDocument | null> {
    const found = this.executions.get(executionId);
    if (!found) return null;
    if (tenantId && found.tenantId !== tenantId) return null;
    return structuredClone(found);
  }

  async listPipelineExecutions(limit = 50, tenantId?: string): Promise<PipelineExecutionDocument[]> {
    return [...this.executions.values()]
      .filter((execution) => !tenantId || execution.tenantId === tenantId)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, limit)
      .map((execution) => structuredClone(execution));
  }
}

type MongoStoreContext = {
  client: MongoClient;
  db: Db;
  logs: Collection<MigrationLogDocument>;
  lessons: Collection<LessonLearnedDocument>;
  executions: Collection<PipelineExecutionDocument>;
};

/** Optional connection overrides for web UI pipeline requests (URI/db from request body). */
export type MigrationStoreConnection = {
  mongoUri?: string;
  dbName?: string;
};

let connectionOverride: MigrationStoreConnection | null = null;

function resolveMongoUri(): string | null {
  return connectionOverride?.mongoUri?.trim() || process.env.MONGODB_URI?.trim() || null;
}

/**
 * Database for hvymetl_migration_logs and hvymetl_lessons_learned.
 * Kept separate from the csvToAtlas import target (MONGODB_DB on import env).
 */
export function resolveMemoryDbName(env: NodeJS.ProcessEnv = process.env): string {
  return (
    connectionOverride?.dbName?.trim() ||
    env.HVYMETL_MEMORY_DB?.trim() ||
    env.MONGODB_DB?.trim() ||
    'hvymetl_memory'
  );
}

function resolveMongoDbName(): string {
  return resolveMemoryDbName(process.env);
}

/**
 * Point the feedback/memory store at a specific Atlas cluster before design or reflection.
 * Resets any cached Mongo client so the next getMigrationStore() uses the new settings.
 */
export function configureMigrationStore(connection: MigrationStoreConnection): void {
  connectionOverride = { ...connectionOverride, ...connection };
  resetMigrationStoreSingleton();
}

const mongoStoreSingleton = createModelSingleton(async (): Promise<MongoStoreContext> => {
  const uri = resolveMongoUri();
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(resolveMongoDbName());
  const logs = db.collection<MigrationLogDocument>(MIGRATION_LOGS_COLLECTION);
  const lessons = db.collection<LessonLearnedDocument>(LESSONS_LEARNED_COLLECTION);
  const executions = db.collection<PipelineExecutionDocument>(PIPELINE_EXECUTIONS_COLLECTION);
  await logs.createIndex({ migrationId: 1 }, { unique: true });
  await logs.createIndex({ tableId: 1, loggedAt: -1 });
  await lessons.createIndex({ lessonId: 1 }, { unique: true });
  await lessons.createIndex({ namespace: 1, createdAt: -1 });
  await executions.createIndex({ executionId: 1 }, { unique: true });
  await executions.createIndex({ completedAt: -1 });
  await executions.createIndex({ tenantId: 1, completedAt: -1 });
  return { client, db, logs, lessons, executions };
});

class MongoMigrationStore implements MigrationStore {
  private async ctx(): Promise<MongoStoreContext> {
    return mongoStoreSingleton.getInstance();
  }

  async insertLog(document: MigrationLogDocument): Promise<void> {
    const { logs } = await this.ctx();
    await logs.insertOne(document);
  }

  async findLogByMigrationId(migrationId: string): Promise<MigrationLogDocument | null> {
    const { logs } = await this.ctx();
    return logs.findOne({ migrationId });
  }

  async updateLog(migrationId: string, patch: Partial<MigrationLogDocument>): Promise<void> {
    const { logs } = await this.ctx();
    const result = await logs.updateOne({ migrationId }, { $set: patch });
    if (result.matchedCount === 0) {
      throw new Error(`Migration log not found: ${migrationId}`);
    }
  }

  async upsertLesson(lesson: LessonLearnedDocument): Promise<void> {
    const { lessons } = await this.ctx();
    await lessons.updateOne({ lessonId: lesson.lessonId }, { $set: lesson }, { upsert: true });
  }

  async listLessons(namespace?: string): Promise<LessonLearnedDocument[]> {
    const { lessons } = await this.ctx();
    if (namespace) {
      return lessons.find({ namespace: 'lessons_learned' }).sort({ createdAt: -1 }).toArray();
    }
    return lessons.find({}).sort({ createdAt: -1 }).toArray();
  }

  async insertPipelineExecution(document: PipelineExecutionDocument): Promise<void> {
    const { executions } = await this.ctx();
    await executions.insertOne(document);
  }

  async findPipelineExecution(executionId: string, tenantId?: string): Promise<PipelineExecutionDocument | null> {
    const { executions } = await this.ctx();
    const query = tenantId ? { executionId, tenantId } : { executionId };
    return executions.findOne(query);
  }

  async listPipelineExecutions(limit = 50, tenantId?: string): Promise<PipelineExecutionDocument[]> {
    const { executions } = await this.ctx();
    const query = tenantId ? { tenantId } : {};
    return executions.find(query).sort({ completedAt: -1 }).limit(limit).toArray();
  }
}

let defaultStore: MigrationStore | null = null;

/**
 * Resolve the active migration store: MongoDB when URI is set, otherwise in-memory.
 * Pass an explicit store in tests via feedbackCollector options.
 */
export function getMigrationStore(): MigrationStore {
  if (defaultStore) return defaultStore;
  if (resolveMongoUri()) {
    defaultStore = new MongoMigrationStore();
  } else {
    defaultStore = new InMemoryMigrationStore();
    console.info('[ml_engine/migrationStore] MONGODB_URI unset — using in-memory migration logs.');
  }
  return defaultStore;
}

/** Override the default store (tests). */
export function setMigrationStore(store: MigrationStore | null): void {
  defaultStore = store;
}

/** Reset Mongo singleton (tests). */
export function resetMigrationStoreSingleton(): void {
  mongoStoreSingleton.reset();
  defaultStore = null;
}
