/** OpenAI function definitions for the Release 4.0 sizing assistant. */

export const SIZING_ASSISTANT_TOOL_NAMES = [
  'update_sizing_parameters',
  'update_shard_penalty',
  'abort_sizing_process',
  'handoff_to_resource_curator',
  'get_session_transcripts',
  'extract_sizing_from_transcripts',
  'find_optimal_cluster_tier',
  'prompt_for_missing_info',
] as const;

export type SizingAssistantToolName = (typeof SIZING_ASSISTANT_TOOL_NAMES)[number];

export function isSizingAssistantToolName(value: string): value is SizingAssistantToolName {
  return (SIZING_ASSISTANT_TOOL_NAMES as readonly string[]).includes(value);
}

export const SIZING_ASSISTANT_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'update_sizing_parameters',
      description:
        'Merge partial cluster-level sizing parameters into session state (data size, QPS/TPS, doc size, flags, etc.).',
      parameters: {
        type: 'object',
        properties: {
          projected_total_data_size_gb: { type: 'number' },
          total_raw_read_ops: { type: 'number' },
          total_raw_write_ops: { type: 'number' },
          avg_doc_size_kb: { type: 'number' },
          secondary_index_count: { type: 'number' },
          data_compression_percentage: { type: 'number' },
          geo_sharded_regions_required: { type: 'number' },
          workload_type: { type: 'string', enum: ['CONSISTENT', 'INTERMITTENT'] },
          read_sla_gt_50ms: { type: 'boolean' },
          user_specified_addl_secondaries: { type: 'number' },
          is_bulk_ops_permitted: { type: 'boolean' },
          is_multi_region_required_for_ha: { type: 'boolean' },
          estimated_data_growth_gb_per_month: { type: 'number' },
          active_working_set_percentage: { type: 'number' },
          target_availability_sla: { type: 'string' },
          rto_seconds: { type: 'number' },
          rpo_seconds: { type: 'number' },
          cloud_provider: { type: 'string', enum: ['AWS', 'GCP', 'AZURE'] },
          target_regions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Atlas region names for the chosen cloud provider (e.g. us-east-1, us-central1, East US).',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_shard_penalty',
      description: 'Update the shard penalty multiplier applied when ranking sharded configurations.',
      parameters: {
        type: 'object',
        required: ['shard_penalty_multiplier'],
        properties: {
          shard_penalty_multiplier: { type: 'number', description: 'Must be >= 1.0. Default 1.75.' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'abort_sizing_process',
      description: 'Cancel the sizing workflow and clear session sizing state.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'handoff_to_resource_curator',
      description: 'Mark Resource Curator handoff as pending and return payload for downstream curator UI.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_session_transcripts',
      description: 'List transcripts attached to this sizing session for extraction.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'extract_sizing_from_transcripts',
      description: 'Parse selected transcript text and merge extracted sizing parameters into session state.',
      parameters: {
        type: 'object',
        properties: {
          transcript_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'When omitted, all session transcripts are parsed.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_optimal_cluster_tier',
      description:
        'Run the sizing engine against current session parameters and return ranked Atlas tier recommendations.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'prompt_for_missing_info',
      description: 'Return standard questions for required sizing parameters not yet captured.',
      parameters: { type: 'object', properties: {} },
    },
  },
] as const;
