/** Studio-scheduled ML reflection job cadence presets. */
export type ReflectionSchedulePreset = 'hourly' | 'daily' | 'weekly';

/** Lifecycle state for an in-process scheduled job (destroy removes the document). */
export type ReflectionJobStatus = 'running' | 'stopped';

export type ReflectionJobRunSummary = {
  processed: number;
  lessonsPersisted: number;
  errors: string[];
  finishedAt: string;
};

export type ReflectionJobDocument = {
  jobId: string;
  tenantId: string;
  name: string;
  schedule: ReflectionSchedulePreset;
  status: ReflectionJobStatus;
  /** Minimum age of `pending_reflection` logs before this job reflects them (soak). */
  minAgeMs: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunSummary?: ReflectionJobRunSummary;
  nextRunAt?: string;
};

export const REFLECTION_JOBS_COLLECTION = 'hvymetl_reflection_jobs';

export const REFLECTION_SCHEDULE_INTERVAL_MS: Record<ReflectionSchedulePreset, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Validate schedule preset from API / UI input. */
export function parseReflectionSchedulePreset(raw: unknown): ReflectionSchedulePreset | null {
  if (raw === 'hourly' || raw === 'daily' || raw === 'weekly') return raw;
  return null;
}

/** Compute the next run timestamp from a preset and optional anchor time. */
export function computeNextRunAt(schedule: ReflectionSchedulePreset, fromMs: number = Date.now()): string {
  return new Date(fromMs + REFLECTION_SCHEDULE_INTERVAL_MS[schedule]).toISOString();
}
