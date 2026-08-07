/**
 * Live MongoDB Atlas Admin API metrics for the ML lessons-learned feedback loop.
 * Reuses OAuth from atlasLogs.ts (ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET, ATLAS_GROUP_ID).
 */

import type { MigrationLogDocument } from './feedbackTypes.js';
import type { AtlasActualPerformance } from './feedbackTypes.js';
import type { AtlasMetricsConnector } from './feedbackCollector.js';
import { setAtlasMetricsConnector } from './feedbackCollector.js';
import {
  configureAtlasLogsRuntime,
  getAtlasAccessToken,
  getAtlasFetchImpl,
  readAtlasLogsConfig,
  type AtlasLogsEnvConfig,
} from '../utilities/atlasLogs.js';

const ATLAS_API_BASE = 'https://cloud.mongodb.com/api/atlas/v2';
const ATLAS_PROCESSES_ACCEPT = 'application/vnd.atlas.2025-03-12+json';
const ATLAS_MEASUREMENTS_ACCEPT = 'application/vnd.atlas.2025-03-12+json';
const ATLAS_PERFORMANCE_ADVISOR_ACCEPT = 'application/vnd.atlas.2025-03-12+json';

const DEFAULT_OBSERVATION_PERIOD = 'PT1H';
const DEFAULT_GRANULARITY = 'PT5M';
const DEFAULT_TIER_IOPS_CAP = 3000;

export type AtlasMetricsEnvConfig = AtlasLogsEnvConfig & {
  /** Atlas cluster **name** (not SRV hostname) for advisor/measurement paths. */
  clusterName: string;
  tierIopsCap: number;
  observationPeriod: string;
};

type AtlasProcessRecord = {
  id?: string;
  hostname?: string;
  userAlias?: string;
  typeName?: string;
  replicaSetName?: string;
};

type AtlasProcessesResponse = {
  results?: AtlasProcessRecord[];
};

type AtlasMeasurementPoint = {
  timestamp?: string;
  value?: number;
};

type AtlasMeasurementSeries = {
  name?: string;
  dataPoints?: AtlasMeasurementPoint[];
};

type AtlasMeasurementsResponse = {
  measurements?: AtlasMeasurementSeries[];
};

type AtlasSlowQueryLogEntry = {
  line?: string;
  namespace?: string;
};

type AtlasSlowQueryLogsResponse = {
  results?: AtlasSlowQueryLogEntry[];
  totalCount?: number;
};

/** Read Atlas metrics config when Admin API creds and cluster name are set. */
export function readAtlasMetricsConfig(env: NodeJS.ProcessEnv = process.env): AtlasMetricsEnvConfig | null {
  const base = readAtlasLogsConfig(env);
  if (!base) return null;

  const clusterName =
    env.HVYMETL_ATLAS_CLUSTER_ID?.trim() || env.ATLAS_CLUSTER_NAME?.trim() || '';
  if (!clusterName) return null;

  const tierCapRaw = env.HVYMETL_ATLAS_TIER_IOPS_CAP?.trim();
  const tierIopsCap =
    tierCapRaw && Number.isFinite(Number(tierCapRaw)) && Number(tierCapRaw) > 0
      ? Number(tierCapRaw)
      : DEFAULT_TIER_IOPS_CAP;

  const observationPeriod = env.HVYMETL_ATLAS_METRICS_PERIOD?.trim() || DEFAULT_OBSERVATION_PERIOD;

  return { ...base, clusterName, tierIopsCap, observationPeriod };
}

/** True when live Atlas metrics connector should be registered (not stub mode). */
export function shouldUseAtlasApiMetricsConnector(env: NodeJS.ProcessEnv = process.env): boolean {
  const stubMode = env.HVYMETL_ATLAS_STUB_MODE?.trim().toLowerCase();
  if (stubMode === 'healthy' || stubMode === 'degraded') return false;
  return readAtlasMetricsConfig(env) !== null;
}

/** Derive cache miss rate from WiredTiger cache used vs max bytes (0–1). */
export function deriveCacheMissRateFromCacheBytes(cacheUsedBytes: number, cacheMaxBytes: number): number {
  if (!Number.isFinite(cacheUsedBytes) || !Number.isFinite(cacheMaxBytes) || cacheMaxBytes <= 0) {
    return 0.12;
  }
  const utilization = Math.min(1, Math.max(0, cacheUsedBytes / cacheMaxBytes));
  return Math.min(0.99, Math.max(0, 1 - utilization * 0.85 + 0.02));
}

/** Derive IOPS utilization ratio against a tier cap (0–1). */
export function deriveIopsUtilization(readIops: number, writeIops: number, tierCap: number): number {
  if (!Number.isFinite(tierCap) || tierCap <= 0) return 0.5;
  const total = Math.max(0, readIops) + Math.max(0, writeIops);
  return Math.min(0.99, total / tierCap);
}

/** Average the latest non-null measurement points in a series. */
export function averageLatestMeasurementPoints(series: AtlasMeasurementSeries | undefined): number {
  const points = series?.dataPoints ?? [];
  const values = points.map((point) => point.value).filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return 0;
  const tail = values.slice(-6);
  return tail.reduce((sum, value) => sum + value, 0) / tail.length;
}

/** Pick a primary mongod process for the named cluster. */
export function selectProcessForCluster(
  processes: AtlasProcessRecord[],
  clusterName: string,
): AtlasProcessRecord | undefined {
  const normalizedCluster = clusterName.trim().toLowerCase();
  const mongodProcesses = processes.filter((process) => {
    if (!process.typeName) return true;
    return /mongod|replica/i.test(process.typeName);
  });

  const byReplica = mongodProcesses.find((process) => {
    const host = (process.userAlias ?? process.hostname ?? '').toLowerCase();
    const replica = process.replicaSetName?.toLowerCase() ?? '';
    return host.includes(normalizedCluster) || replica.includes(normalizedCluster);
  });
  if (byReplica) return byReplica;

  return mongodProcesses.find((process) => {
    const host = (process.userAlias ?? process.hostname ?? '').toLowerCase();
    return host.includes(normalizedCluster.replace(/\s+/g, ''));
  });
}

/** Build Atlas process id (`hostname:27017`) for measurements API. */
export function buildAtlasProcessId(process: AtlasProcessRecord): string | undefined {
  if (process.id?.includes(':')) return process.id;
  const host = process.userAlias?.trim() || process.hostname?.trim();
  if (!host) return undefined;
  return `${host}:27017`;
}

function measurementSeriesByName(
  response: AtlasMeasurementsResponse,
  names: string[],
): AtlasMeasurementSeries | undefined {
  const lowered = new Set(names.map((name) => name.toLowerCase()));
  return response.measurements?.find((series) => {
    const name = series.name?.toLowerCase() ?? '';
    return lowered.has(name);
  });
}

/** Fetch process list from Atlas Admin API. */
export async function fetchAtlasProcesses(
  config: AtlasMetricsEnvConfig,
  options?: { token?: string },
): Promise<AtlasProcessRecord[]> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/processes?itemsPerPage=500&pageNum=1`;
  const response = await getAtlasFetchImpl()(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: ATLAS_PROCESSES_ACCEPT },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Atlas processes request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as AtlasProcessesResponse;
  return data.results ?? [];
}

/** Fetch disk/cache measurements for a process id. */
export async function fetchAtlasProcessMeasurements(
  config: AtlasMetricsEnvConfig,
  processId: string,
  options?: { token?: string },
): Promise<AtlasMeasurementsResponse> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const encodedProcessId = encodeURIComponent(processId);
  const params = new URLSearchParams({
    granularity: DEFAULT_GRANULARITY,
    period: config.observationPeriod,
  });
  for (const metric of [
    'CACHE_BYTES_USED',
    'CACHE_MAX_BYTES',
    'DISK_PARTITION_IOPS_TOTAL_READ',
    'DISK_PARTITION_IOPS_TOTAL_WRITE',
  ]) {
    params.append('m', metric);
  }

  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/processes/${encodedProcessId}/measurements?${params.toString()}`;
  const response = await getAtlasFetchImpl()(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: ATLAS_MEASUREMENTS_ACCEPT },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Atlas measurements request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return (await response.json()) as AtlasMeasurementsResponse;
}

/** Count slow query log entries in the observation window for a cluster. */
export async function fetchAtlasSlowQueryCount(
  config: AtlasMetricsEnvConfig,
  options?: { token?: string; namespace?: string },
): Promise<number> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const params = new URLSearchParams({
    duration: config.observationPeriod,
    itemsPerPage: '500',
    pageNum: '1',
  });
  if (options?.namespace) params.set('namespaces', options.namespace);

  const url = `${ATLAS_API_BASE}/groups/${encodeURIComponent(config.groupId)}/clusters/${encodeURIComponent(config.clusterName)}/performanceAdvisor/slowQueryLogs?${params.toString()}`;
  const response = await getAtlasFetchImpl()(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: ATLAS_PERFORMANCE_ADVISOR_ACCEPT },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Atlas slow query logs request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as AtlasSlowQueryLogsResponse;
  if (typeof data.totalCount === 'number') return data.totalCount;
  return (data.results ?? []).length;
}

/** Map Atlas API signals to AtlasActualPerformance for analyzeAndReflect. */
export async function fetchAtlasActualPerformance(
  config: AtlasMetricsEnvConfig,
  log: MigrationLogDocument,
  options?: { token?: string },
): Promise<AtlasActualPerformance> {
  const token = options?.token ?? (await getAtlasAccessToken(config));
  const namespace =
    log.atlasCorrelation?.targetDatabase && log.atlasCorrelation?.targetCollection
      ? `${log.atlasCorrelation.targetDatabase}.${log.atlasCorrelation.targetCollection}`
      : undefined;

  const processes = await fetchAtlasProcesses(config, { token });
  const process = selectProcessForCluster(processes, config.clusterName);
  const processId = process ? buildAtlasProcessId(process) : undefined;

  let actualCacheMissRate = 0.12;
  let actualIopsUtilization = 0.4;
  if (processId) {
    const measurements = await fetchAtlasProcessMeasurements(config, processId, { token });
    const cacheUsed = averageLatestMeasurementPoints(
      measurementSeriesByName(measurements, ['CACHE_BYTES_USED', 'WiredTigerCacheUsed']),
    );
    const cacheMax = averageLatestMeasurementPoints(
      measurementSeriesByName(measurements, ['CACHE_MAX_BYTES', 'WiredTigerCacheMaximum']),
    );
    const readIops = averageLatestMeasurementPoints(
      measurementSeriesByName(measurements, ['DISK_PARTITION_IOPS_TOTAL_READ']),
    );
    const writeIops = averageLatestMeasurementPoints(
      measurementSeriesByName(measurements, ['DISK_PARTITION_IOPS_TOTAL_WRITE']),
    );
    actualCacheMissRate = deriveCacheMissRateFromCacheBytes(cacheUsed, cacheMax);
    actualIopsUtilization = deriveIopsUtilization(readIops, writeIops, config.tierIopsCap);
  }

  const slowQueryCount = await fetchAtlasSlowQueryCount(config, { token, namespace });

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - parsePeriodMs(config.observationPeriod));

  return {
    actualCacheMissRate,
    actualIopsUtilization,
    slowQueryCount,
    sampledAt: windowEnd.toISOString(),
    source: 'atlas-api',
    observationWindow: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    processId,
    projectId: log.atlasCorrelation?.projectId ?? config.groupId,
    targetDatabase: log.atlasCorrelation?.targetDatabase,
    targetCollection: log.atlasCorrelation?.targetCollection,
  };
}

/** Parse ISO-8601 duration like PT1H to milliseconds (minimal subset). */
export function parsePeriodMs(period: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(period.trim());
  if (!match) return 3_600_000;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/** Production Atlas metrics connector for feedbackCollector. */
export class AtlasApiMetricsConnector implements AtlasMetricsConnector {
  constructor(private readonly config: AtlasMetricsEnvConfig) {}

  async fetch(
    _clusterId: string,
    _migrationId: string,
    log: MigrationLogDocument,
  ): Promise<AtlasActualPerformance> {
    return fetchAtlasActualPerformance(this.config, log);
  }
}

/** Register AtlasApiMetricsConnector when Admin API creds and cluster name are configured. */
export function bootstrapAtlasMetricsConnector(env: NodeJS.ProcessEnv = process.env): void {
  if (!shouldUseAtlasApiMetricsConnector(env)) return;
  const config = readAtlasMetricsConfig(env);
  if (!config) return;
  setAtlasMetricsConnector(new AtlasApiMetricsConnector(config));
  console.info(
    `[ml_engine/atlasApiMetrics] Live Atlas metrics enabled cluster=${config.clusterName} project=${config.groupId.slice(0, 4)}…`,
  );
}

/** Re-export for tests that mock fetch alongside atlasLogs. */
export { configureAtlasLogsRuntime };
