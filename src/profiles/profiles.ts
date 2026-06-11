/**
 * Built-in workload profiles.
 *
 * MongoDB schemas are optimized around how data is ACCESSED, not how it
 * looks. Each profile captures one realistic access pattern (read/write
 * ratio, peak traffic, growth) plus the MongoDB tuning that workload needs:
 * which design patterns to prefer, what write concern to use, and how to
 * size the driver's connection pool.
 *
 * The user picks a profile at runtime with `--profile <id>` or interactively;
 * `--custom` lets them supply exact telemetry numbers instead.
 */

import type { WorkloadProfile, WorkloadProfileId, WorkloadTelemetry } from '../types.js';

/**
 * The eight preset profiles, keyed by id. Tuning rationale:
 * - Read-heavy workloads get large pools (many concurrent readers) and
 *   patterns that pre-duplicate data for single-document O(1) reads.
 * - Write-heavy workloads get Bucket/reference patterns to keep documents
 *   small and writes fast, and `w: 1` so acknowledgment latency stays low.
 * - Critical/financial workloads get `w: "majority"` + journaling so a
 *   confirmed write can never be rolled back.
 */
export const WORKLOAD_PROFILES: Record<Exclude<WorkloadProfileId, 'custom'>, WorkloadProfile> = {
  catalog: {
    id: 'catalog',
    label: 'E-commerce Catalog',
    description: 'Product browsing dominates; writes are rare merchandising updates.',
    telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60000, growthRate: '5GB/month' },
    preferredPatterns: ['extended-reference', 'computed', 'subset', 'attribute', 'outlier'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 200, minPoolSize: 20, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  },
  cms: {
    id: 'cms',
    label: 'Content Management',
    description: 'Published content is read constantly; editors write occasionally.',
    telemetry: { readPercent: 90, writePercent: 10, peakRpm: 30000, growthRate: '2GB/month' },
    preferredPatterns: ['embed', 'polymorphic', 'schema-versioning', 'tree', 'subset'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 150, minPoolSize: 15, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  },
  iot: {
    id: 'iot',
    label: 'IoT Telemetry',
    description: 'Massive sensor ingest; dashboards read aggregates occasionally.',
    telemetry: { readPercent: 10, writePercent: 90, peakRpm: 600000, growthRate: '1TB/week' },
    preferredPatterns: ['bucket', 'computed', 'preallocation', 'reference'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 300, minPoolSize: 50, socketTimeoutMS: 60000, maxIdleTimeMS: 120000 },
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile Backend',
    description: 'Bursty app traffic: profile reads dominate, sessions and events write in spikes.',
    telemetry: { readPercent: 80, writePercent: 20, peakRpm: 120000, growthRate: '50GB/month' },
    preferredPatterns: ['extended-reference', 'subset', 'bucket', 'computed'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 250, minPoolSize: 25, socketTimeoutMS: 20000, maxIdleTimeMS: 30000 },
  },
  personalization: {
    id: 'personalization',
    label: 'Personalization Engine',
    description: 'Recommendation reads at request time; affinity scores updated continuously.',
    telemetry: { readPercent: 70, writePercent: 30, peakRpm: 90000, growthRate: '20GB/month' },
    preferredPatterns: ['computed', 'extended-reference', 'subset', 'attribute'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 200, minPoolSize: 20, socketTimeoutMS: 15000, maxIdleTimeMS: 30000 },
  },
  'realtime-analytics': {
    id: 'realtime-analytics',
    label: 'Real-Time Analytics',
    description: 'High-velocity event ingest with live dashboard rollups.',
    telemetry: { readPercent: 30, writePercent: 70, peakRpm: 300000, growthRate: '500GB/month' },
    preferredPatterns: ['bucket', 'computed', 'preallocation', 'reference'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 300, minPoolSize: 40, socketTimeoutMS: 60000, maxIdleTimeMS: 120000 },
  },
  'single-view': {
    id: 'single-view',
    label: 'Single View (Customer 360)',
    description: 'Unified customer documents assembled from many systems; read-mostly.',
    telemetry: { readPercent: 85, writePercent: 15, peakRpm: 45000, growthRate: '10GB/month' },
    preferredPatterns: ['extended-reference', 'subset', 'computed', 'schema-versioning', 'outlier'],
    writeConcern: { w: 1, journal: false },
    pool: { maxPoolSize: 150, minPoolSize: 15, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  },
  ledger: {
    id: 'ledger',
    label: 'Financial Ledger',
    description: 'Balanced read/write with zero tolerance for lost or rolled-back writes.',
    telemetry: { readPercent: 50, writePercent: 50, peakRpm: 20000, growthRate: '15GB/month' },
    preferredPatterns: ['reference', 'computed', 'schema-versioning', 'bucket'],
    writeConcern: { w: 'majority', journal: true },
    pool: { maxPoolSize: 100, minPoolSize: 10, socketTimeoutMS: 45000, maxIdleTimeMS: 60000 },
  },
};

/** Every preset profile as an array, useful for menus and listings. */
export const ALL_PROFILES: WorkloadProfile[] = Object.values(WORKLOAD_PROFILES);

/**
 * Look up a preset profile by id. Throws with a helpful message listing the
 * valid ids when the requested one does not exist.
 */
export function getProfile(id: string): WorkloadProfile {
  const profile = WORKLOAD_PROFILES[id as Exclude<WorkloadProfileId, 'custom'>];
  if (!profile) {
    const validIds = Object.keys(WORKLOAD_PROFILES).join(', ');
    throw new Error(`Unknown profile "${id}". Valid profiles: ${validIds}, or use --custom.`);
  }
  return profile;
}

/**
 * Build a "custom" profile from user-supplied telemetry. The write concern
 * and pool settings are derived from the numbers using the same heuristics
 * the presets follow, so a custom workload still gets sensible tuning.
 *
 * @param telemetry - The user's exact read/write ratio, RPM, and growth rate.
 * @param isCritical - True when lost writes are unacceptable (financial data).
 */
export function buildCustomProfile(telemetry: WorkloadTelemetry, isCritical: boolean): WorkloadProfile {
  const isWriteHeavy = telemetry.writePercent >= 60;
  const isHighRpm = telemetry.peakRpm >= 100000;

  return {
    id: 'custom',
    label: 'Custom Workload',
    description: `User-supplied telemetry: ${telemetry.readPercent}:${telemetry.writePercent} R:W at ${telemetry.peakRpm} RPM.`,
    telemetry,
    preferredPatterns: isWriteHeavy
      ? ['bucket', 'computed', 'reference', 'preallocation']
      : ['extended-reference', 'computed', 'subset', 'attribute'],
    writeConcern: isCritical ? { w: 'majority', journal: true } : { w: 1, journal: false },
    pool: {
      maxPoolSize: isHighRpm ? 300 : 150,
      minPoolSize: isHighRpm ? 40 : 15,
      socketTimeoutMS: isWriteHeavy ? 60000 : 30000,
      maxIdleTimeMS: 60000,
    },
  };
}
