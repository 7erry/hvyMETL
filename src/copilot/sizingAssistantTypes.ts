/**
 * Types for the Release 4.0 Atlas sizing assistant runtime.
 */

import type { CopilotChatMessage } from './groveChat.js';

import type { SizingCloudProvider } from './sizingCloudProvider.js';

/** Workload steadiness rating used by the sizing engine eligibility filters. */
export type SizingWorkloadType = 'CONSISTENT' | 'INTERMITTENT';

export type { SizingCloudProvider };

/** Cluster-level inputs consumed by {@link findOptimalClusterTier}. */
export type SizingEngineParameters = {
  projected_total_data_size_gb?: number;
  total_raw_read_ops?: number;
  total_raw_write_ops?: number;
  avg_doc_size_kb?: number;
  secondary_index_count?: number;
  data_compression_percentage?: number;
  geo_sharded_regions_required?: number;
  workload_type?: SizingWorkloadType;
  read_sla_gt_50ms?: boolean;
  user_specified_addl_secondaries?: number;
  is_bulk_ops_permitted?: boolean;
  is_multi_region_required_for_ha?: boolean;
  shard_penalty_multiplier?: number;
};

/** Extended session fields for architecture briefs and transcript extraction. */
export type SizingSessionExtendedFields = {
  estimated_data_growth_gb_per_month?: number;
  active_working_set_percentage?: number;
  target_availability_sla?: string;
  rto_seconds?: number;
  rpo_seconds?: number;
  cloud_provider?: SizingCloudProvider | string;
  target_regions?: string[];
};

/** Full parameter bag stored on the sizing session. */
export type SizingSessionParameters = SizingEngineParameters & SizingSessionExtendedFields;

/** Resource curator handoff lifecycle. */
export type ResourceCuratorHandoffStatus = 'not_started' | 'pending' | 'completed';

/** Mutable sizing assistant session. */
export type SizingAssistantSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  aborted: boolean;
  parameters: SizingSessionParameters;
  shardPenaltyMultiplier: number;
  resourceCuratorHandoff: ResourceCuratorHandoffStatus;
  /** Raw transcript bodies selected for extraction. */
  transcripts: Array<{ id: string; title: string; body: string }>;
  chatMessages: CopilotChatMessage[];
};

/** One ranked configuration from the sizing engine (includes cost for sorting; strip for user text). */
export type ClusterTierConfiguration = {
  tierId: string;
  displayName: string;
  ramGb: number;
  vcpu: number;
  baseIops: number;
  shardCount: number;
  additionalSecondaries: number;
  normalizedReadOpsPerShard: number;
  normalizedWriteOpsPerShard: number;
  parametersUsed: Required<
    Pick<
      SizingEngineParameters,
      | 'projected_total_data_size_gb'
      | 'total_raw_read_ops'
      | 'total_raw_write_ops'
      | 'avg_doc_size_kb'
      | 'secondary_index_count'
      | 'data_compression_percentage'
      | 'geo_sharded_regions_required'
      | 'workload_type'
      | 'read_sla_gt_50ms'
      | 'user_specified_addl_secondaries'
      | 'is_bulk_ops_permitted'
      | 'is_multi_region_required_for_ha'
      | 'shard_penalty_multiplier'
    >
  >;
  /** Hourly cost used for ranking only — omit in user-facing assistant text. */
  finalHourlyCost: number;
  rank: number;
};

/** User-safe tier recommendation (no pricing fields). */
export type ClusterTierRecommendation = Omit<ClusterTierConfiguration, 'finalHourlyCost'>;

export const REQUIRED_SIZING_ENGINE_FIELDS: Array<keyof SizingEngineParameters> = [
  'projected_total_data_size_gb',
  'total_raw_read_ops',
  'total_raw_write_ops',
  'avg_doc_size_kb',
];

export const DEFAULT_SHARD_PENALTY_MULTIPLIER = 1.75;
