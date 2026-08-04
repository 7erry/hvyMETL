/**
 * Oplog sizing guidance returned with cluster tier recommendations.
 */

import {
  estimateOplogSizeGb,
  resolveSizingEngineParameters,
} from './sizingEngine.js';
import type { SizingEngineParameters } from './sizingAssistantTypes.js';

export type OplogRecommendation = {
  retentionHours: number;
  estimatedOplogSizeGb: number;
  peakWriteThroughputMbPerSec: number;
  minimumRetentionHours: number;
  maximumRetentionHours: number;
  guidance: string;
};

const DEFAULT_RETENTION_HOURS = 36;
const MIN_RETENTION_HOURS = 24;
const MAX_RETENTION_HOURS = 48;

/** Builds oplog sizing numbers and narrative guidance from engine parameters. */
export function buildOplogRecommendation(params: SizingEngineParameters): OplogRecommendation {
  const resolved = resolveSizingEngineParameters(params);
  const peakWriteThroughputMbPerSec =
    (resolved.total_raw_write_ops * resolved.avg_doc_size_kb) / 1024;
  const estimatedOplogSizeGb = estimateOplogSizeGb(resolved, DEFAULT_RETENTION_HOURS);
  const roundedGb = Math.max(0.01, Math.round(estimatedOplogSizeGb * 100) / 100);

  const guidance = [
    `Target **${DEFAULT_RETENTION_HOURS} hours** of oplog retention at peak write load (${peakWriteThroughputMbPerSec.toFixed(2)} MB/s logical write throughput).`,
    `Estimated oplog working size: **~${roundedGb} GB** per shard (scale with shard count for sharded clusters).`,
    `If peak bursts or cross-region replication lag exceed ${MIN_RETENTION_HOURS}h of headroom, increase oplog capacity or reduce burst write batch sizes.`,
    'For continuous backup and PITR, maintain at least 24–48h of oplog to survive maintenance windows and replication catch-up.',
  ].join(' ');

  return {
    retentionHours: DEFAULT_RETENTION_HOURS,
    estimatedOplogSizeGb: roundedGb,
    peakWriteThroughputMbPerSec: Math.round(peakWriteThroughputMbPerSec * 100) / 100,
    minimumRetentionHours: MIN_RETENTION_HOURS,
    maximumRetentionHours: MAX_RETENTION_HOURS,
    guidance,
  };
}
