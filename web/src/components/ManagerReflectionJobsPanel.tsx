import { useCallback, useEffect, useState } from 'react';
import {
  createReflectionJob,
  destroyReflectionJob,
  fetchReflectionJobs,
  startReflectionJob,
  stopReflectionJob,
  type ReflectionJobRecord,
  type ReflectionSchedulePreset,
} from '../api';
import { CollapsiblePanel } from './CollapsiblePanel';

const SCHEDULE_OPTIONS: { value: ReflectionSchedulePreset; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatMinAge(ms: number): string {
  if (ms <= 0) return 'None';
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h soak`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m soak`;
  return `${ms}ms soak`;
}

/** Manager View — scheduled ML reflection jobs (Atlas metrics → lessons learned). */
export function ManagerReflectionJobsPanel() {
  const [jobs, setJobs] = useState<ReflectionJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Post-import reflection');
  const [schedule, setSchedule] = useState<ReflectionSchedulePreset>('daily');
  const [soakHours, setSoakHours] = useState(1);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReflectionJobs();
      setJobs(data.jobs);
    } catch (err) {
      setJobs([]);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    setError(null);
    try {
      await createReflectionJob({
        name: name.trim() || 'Reflection job',
        schedule,
        minAgeMs: Math.max(0, soakHours) * 3_600_000,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function withJobAction(jobId: string, action: () => Promise<void>) {
    setBusyJobId(jobId);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyJobId(null);
    }
  }

  const hint =
    jobs.length === 0
      ? 'No scheduled jobs'
      : `${jobs.filter((j) => j.status === 'running').length} running · ${jobs.length} total`;

  return (
    <CollapsiblePanel title="Lessons learned — scheduled reflection" collapsedHint={hint}>
      <p className="manager-hint">
        Runs on the Migration Studio API server on an hourly, daily, or weekly cadence. Each tick reflects
        migration logs still in <code>pending_reflection</code> after the soak period, using live Atlas metrics
        when configured. Requires <code>MONGODB_URI</code> on the server (or tenant secrets when hosted).
      </p>

      <div className="manager-reflection-form">
        <label className="manager-reflection-form__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Post-import reflection"
          />
        </label>
        <label className="manager-reflection-form__field">
          <span>Schedule</span>
          <select value={schedule} onChange={(event) => setSchedule(event.target.value as ReflectionSchedulePreset)}>
            {SCHEDULE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="manager-reflection-form__field">
          <span>Soak (hours before reflecting)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={soakHours}
            onChange={(event) => setSoakHours(Number(event.target.value))}
          />
        </label>
        <button type="button" className="manager-reflection-form__create" onClick={() => void handleCreate()}>
          Create job
        </button>
      </div>

      {error ? <p className="manager-hint">{error}</p> : null}
      {loading ? <p className="manager-hint">Loading jobs…</p> : null}

      {!loading && jobs.length === 0 ? (
        <p className="manager-hint">Create a job, then Start it to enable the schedule.</p>
      ) : null}

      <ul className="manager-reflection-job-list">
        {jobs.map((job) => (
          <li key={job.jobId} className="manager-reflection-job">
            <div className="manager-reflection-job__head">
              <strong>{job.name}</strong>
              <span className={`manager-reflection-job__status manager-reflection-job__status--${job.status}`}>
                {job.status}
              </span>
            </div>
            <dl className="manager-metrics manager-reflection-job__meta">
              <div>
                <dt>Schedule</dt>
                <dd>{job.schedule}</dd>
              </div>
              <div>
                <dt>Soak</dt>
                <dd>{formatMinAge(job.minAgeMs)}</dd>
              </div>
              <div>
                <dt>Last run</dt>
                <dd>{formatWhen(job.lastRunAt)}</dd>
              </div>
              <div>
                <dt>Next run</dt>
                <dd>{job.status === 'running' ? formatWhen(job.nextRunAt) : '—'}</dd>
              </div>
            </dl>
            {job.lastRunSummary ? (
              <p className="manager-hint">
                Last tick: {job.lastRunSummary.processed} log(s), {job.lastRunSummary.lessonsPersisted} lesson(s)
                {job.lastRunSummary.errors.length > 0
                  ? ` · ${job.lastRunSummary.errors.length} error(s)`
                  : ''}
              </p>
            ) : null}
            <div className="manager-reflection-job__actions">
              {job.status === 'stopped' ? (
                <button
                  type="button"
                  disabled={busyJobId === job.jobId}
                  onClick={() => void withJobAction(job.jobId, () => startReflectionJob(job.jobId))}
                >
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyJobId === job.jobId}
                  onClick={() => void withJobAction(job.jobId, () => stopReflectionJob(job.jobId))}
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                className="manager-reflection-job__destroy"
                disabled={busyJobId === job.jobId}
                onClick={() => void withJobAction(job.jobId, () => destroyReflectionJob(job.jobId))}
              >
                Destroy
              </button>
            </div>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}
