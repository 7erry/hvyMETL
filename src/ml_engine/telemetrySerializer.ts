/**
 * Convert hvyMETL workload profiles and SQL models into normalized telemetry
 * tensors and dense semantic strings for cross-encoder pairing.
 */

import type { SqlStructuralModel, WorkloadProfile } from '../types.js';
import type { TelemetryData } from './types.js';

const GROWTH_UNIT_TO_MB: Record<string, number> = {
  b: 1 / (1024 * 1024),
  kb: 1 / 1024,
  mb: 1,
  gb: 1024,
  tb: 1024 * 1024,
};

const PERIOD_TO_MONTHLY_FACTOR: Record<string, number> = {
  day: 30,
  daily: 30,
  week: 4.345,
  weekly: 4.345,
  month: 1,
  monthly: 1,
  mo: 1,
  year: 1 / 12,
  yearly: 1 / 12,
};

/**
 * Parse strings like "10GB/month", "120MB/mo", or "1TB/week" into MB/month.
 * Falls back to a conservative default when parsing fails.
 */
export function parseGrowthRateMbPerMonth(growthRate: string, fallbackMb = 1024): number {
  const normalized = growthRate.trim().toLowerCase().replace(/\s+/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)\/?(day|daily|week|weekly|month|monthly|mo|year|yearly)?$/);
  if (!match) return fallbackMb;

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof GROWTH_UNIT_TO_MB;
  const period = (match[3] ?? 'month') as keyof typeof PERIOD_TO_MONTHLY_FACTOR;
  const mb = amount * (GROWTH_UNIT_TO_MB[unit] ?? 1);
  const monthly = mb * (PERIOD_TO_MONTHLY_FACTOR[period] ?? 1);
  return Number.isFinite(monthly) && monthly > 0 ? monthly : fallbackMb;
}

/** Largest table row count in the structural model (cardinality proxy). */
export function estimateCardinality(model: SqlStructuralModel): number {
  if (model.tables.length === 0) return 0;
  const tableMax = Math.max(...model.tables.map((table) => table.rowCount));
  const relationshipMax = model.relationships.reduce(
    (max, relationship) => Math.max(max, relationship.maxChildrenPerParent),
    0,
  );
  return Math.max(tableMax, relationshipMax);
}

/** Build normalized telemetry from a workload profile and optional SQL model. */
export function buildTelemetryData(profile: WorkloadProfile, model?: SqlStructuralModel): TelemetryData {
  const { telemetry } = profile;
  const readWriteRatio =
    telemetry.writePercent === 0 ? telemetry.readPercent / 100 : telemetry.readPercent / telemetry.writePercent;

  return {
    readWriteRatio,
    peakRpm: telemetry.peakRpm,
    dataGrowthMbPerMonth: parseGrowthRateMbPerMonth(telemetry.growthRate),
    cardinality: model ? estimateCardinality(model) : 0,
    growthRateLabel: telemetry.growthRate,
    readPercent: telemetry.readPercent,
    writePercent: telemetry.writePercent,
  };
}

function classifyReadWrite(telemetry: TelemetryData): string {
  if (telemetry.readPercent >= 70) return `Read-Heavy (${telemetry.readPercent}:${telemetry.writePercent})`;
  if (telemetry.writePercent >= 60) return `Write-Heavy (${telemetry.readPercent}:${telemetry.writePercent})`;
  return `Balanced (${telemetry.readPercent}:${telemetry.writePercent})`;
}

function classifyThroughput(peakRpm: number): string {
  if (peakRpm >= 300_000) return `Extreme Throughput (${peakRpm.toLocaleString('en-US')} RPM)`;
  if (peakRpm >= 100_000) return `High Throughput (${peakRpm.toLocaleString('en-US')} RPM)`;
  if (peakRpm >= 30_000) return `Moderate Throughput (${peakRpm.toLocaleString('en-US')} RPM)`;
  return `Low Throughput (${peakRpm.toLocaleString('en-US')} RPM)`;
}

function classifyGrowth(mbPerMonth: number, label: string): string {
  if (mbPerMonth >= 500_000) return `Explosive Growth (${label}, ~${Math.round(mbPerMonth)}MB/mo)`;
  if (mbPerMonth >= 50_000) return `High Growth (${label}, ~${Math.round(mbPerMonth)}MB/mo)`;
  if (mbPerMonth >= 5_000) return `Steady Growth (${label}, ~${Math.round(mbPerMonth)}MB/mo)`;
  return `Modest Growth (${label}, ~${Math.round(mbPerMonth)}MB/mo)`;
}

function classifyCardinality(cardinality: number): string {
  if (cardinality >= 10_000_000) return `Massive Cardinality (${cardinality.toLocaleString('en-US')} rows)`;
  if (cardinality >= 1_000_000) return `High Cardinality (${cardinality.toLocaleString('en-US')} rows)`;
  if (cardinality >= 100_000) return `Medium Cardinality (${cardinality.toLocaleString('en-US')} rows)`;
  if (cardinality > 0) return `Low Cardinality (${cardinality.toLocaleString('en-US')} rows)`;
  return 'Unknown Cardinality';
}

/**
 * Serialize telemetry into a dense semantic string for cross-encoder pairing.
 *
 * Example: "Workload Profile: Read-Heavy (95:5), High Throughput (60,000 RPM),
 * Growth: Steady Growth (5GB/month, ~5120MB/mo), Cardinality: Medium ..."
 */
export function serializeTelemetryContext(telemetry: TelemetryData): string {
  return [
    'Workload Profile:',
    classifyReadWrite(telemetry),
    classifyThroughput(telemetry.peakRpm),
    `Growth: ${classifyGrowth(telemetry.dataGrowthMbPerMonth, telemetry.growthRateLabel)}`,
    `Cardinality: ${classifyCardinality(telemetry.cardinality)}`,
    `Numeric Features: readWriteRatio=${telemetry.readWriteRatio.toFixed(2)}, peakRpm=${telemetry.peakRpm}, growthMbPerMonth=${Math.round(telemetry.dataGrowthMbPerMonth)}, cardinality=${telemetry.cardinality}`,
  ].join(' | ');
}

/** Render a pattern chunk as the document side of a cross-encoder pair. */
export function serializePatternDocument(candidate: { sourceFile: string; heading: string; text: string }): string {
  return `MongoDB Design Pattern [${candidate.sourceFile}] ${candidate.heading}\n\n${candidate.text}`;
}
