/** Source of the effective raw data size shown to Agent Copilot. */
export type CopilotRawDataSource = 'manager-override' | 'schema-estimate' | 'unavailable';

/** Sharding hint derived from Manager cost projection for copilot sizing answers. */
export type CopilotShardingHint = {
  collectionName: string;
  strategy: string;
  shardKeySummary: string;
  estimatedHotStorageGb: number;
  rationale: string;
};

/** Dataset scale and Atlas sizing context from Manager view settings. */
export type CopilotDatasetScaleContext = {
  rawDataSource: CopilotRawDataSource;
  /** Manager slider override in GB when set (> 0). */
  managerRawDataGb: number | null;
  /** Effective raw relational data size in GB used for projections. */
  rawDataGb: number | null;
  totalStorageGb: number | null;
  activeStorageGb: number | null;
  archiveStorageGb: number | null;
  estimatedTotalRows: number | null;
  averageDocumentBytes: number | null;
  workloadLabel: string | null;
  growthRatePercent: number | null;
  recommendedTierLabel: string | null;
  requiresSharding: boolean;
  shardingRecommendations: CopilotShardingHint[];
};

/** Formats gigabytes for copilot responses (matches Manager view labels). */
export function formatCopilotDataGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)} TB`;
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 10) return `${gb.toFixed(1)} GB`;
  return `${gb.toFixed(2)} GB`;
}

function formatShardKeySummary(shardKey: Record<string, unknown>): string {
  return Object.entries(shardKey)
    .map(([field, direction]) => `${field}: ${String(direction)}`)
    .join(', ');
}

/** Normalizes sharding recommendation rows for schema context payloads. */
export function normalizeCopilotShardingHints(
  recommendations: Array<{
    collectionName: string;
    strategy: string;
    shardKey: Record<string, unknown>;
    estimatedHotStorageGb: number;
    rationale: string;
  }>,
): CopilotShardingHint[] {
  return recommendations.map((rec) => ({
    collectionName: rec.collectionName,
    strategy: rec.strategy,
    shardKeySummary: formatShardKeySummary(rec.shardKey),
    estimatedHotStorageGb: rec.estimatedHotStorageGb,
    rationale: rec.rationale,
  }));
}

/** Renders dataset scale for the Grove system prompt. */
export function formatDatasetScaleSection(scale: CopilotDatasetScaleContext | undefined): string {
  if (!scale || scale.rawDataSource === 'unavailable' || scale.rawDataGb === null) {
    return `(not set — use Manager **Dataset scale — raw data** slider or import CSV row statistics)`;
  }

  const sourceLabel =
    scale.rawDataSource === 'manager-override'
      ? 'Manager slider override (used in lieu of CSV import row counts)'
      : 'DDL/schema heuristic estimate';

  const lines = [
    `- Source: ${sourceLabel}`,
    `- Raw data size: ${formatCopilotDataGb(scale.rawDataGb)}`,
  ];

  if (scale.managerRawDataGb !== null && scale.rawDataSource === 'manager-override') {
    lines.push(`- Manager override: ${formatCopilotDataGb(scale.managerRawDataGb)}`);
  }
  if (scale.totalStorageGb !== null) {
    lines.push(`- Total MongoDB storage (BSON + indexes + archive): ${formatCopilotDataGb(scale.totalStorageGb)}`);
  }
  if (scale.activeStorageGb !== null) {
    lines.push(`- Hot/active storage: ${formatCopilotDataGb(scale.activeStorageGb)}`);
  }
  if (scale.estimatedTotalRows !== null) {
    lines.push(`- Estimated document count: ~${Math.round(scale.estimatedTotalRows).toLocaleString()}`);
  }
  if (scale.averageDocumentBytes !== null) {
    lines.push(`- Average document size: ~${scale.averageDocumentBytes} bytes`);
  }
  if (scale.workloadLabel) {
    lines.push(`- Workload profile: ${scale.workloadLabel}`);
  }
  if (scale.growthRatePercent !== null) {
    lines.push(`- Growth rate: ${scale.growthRatePercent}% / year`);
  }
  if (scale.recommendedTierLabel) {
    lines.push(`- Illustrative Atlas tier: ${scale.recommendedTierLabel}`);
  }
  if (scale.requiresSharding) {
    lines.push('- Sharding: recommended (dataset exceeds single replica-set practical scale)');
  }

  if (scale.shardingRecommendations.length > 0) {
    lines.push('- Sharding recommendations:');
    for (const rec of scale.shardingRecommendations.slice(0, 6)) {
      lines.push(
        `  - ${rec.collectionName}: ${rec.strategy} on { ${rec.shardKeySummary} } (~${formatCopilotDataGb(rec.estimatedHotStorageGb)} hot) — ${rec.rationale}`,
      );
    }
  }

  return lines.join('\n');
}

/** Static reply when the user asks for the current Manager dataset scale. */
export function buildCopilotDatasetScaleResponse(scale: CopilotDatasetScaleContext): string {
  if (scale.rawDataSource === 'unavailable' || scale.rawDataGb === null) {
    return [
      'Raw data size is not set yet.',
      '',
      'In **Manager** view, open **Migration Cost Projection** and adjust **Dataset scale — raw data** (up to 21 TB).',
      'That override is used for Atlas sizing and sharding guidance when CSV import row counts are unavailable.',
    ].join('\n');
  }

  const source =
    scale.rawDataSource === 'manager-override'
      ? 'Manager **Dataset scale — raw data** slider'
      : 'schema/DDL heuristics (no Manager override)';

  const lines = [
    `**Dataset scale — raw data:** ${formatCopilotDataGb(scale.rawDataGb)}`,
    '',
    `- Source: ${source}`,
  ];

  if (scale.totalStorageGb !== null) {
    lines.push(`- Total projected MongoDB storage: ${formatCopilotDataGb(scale.totalStorageGb)}`);
  }
  if (scale.workloadLabel) {
    lines.push(`- Workload: ${scale.workloadLabel}`);
  }
  if (scale.recommendedTierLabel) {
    lines.push(`- Illustrative Atlas tier: ${scale.recommendedTierLabel}`);
  }
  if (scale.requiresSharding) {
    lines.push('- **Sharding recommended** at this scale.');
  }

  if (scale.shardingRecommendations.length > 0) {
    lines.push('', '**Top sharding candidates:**');
    for (const rec of scale.shardingRecommendations.slice(0, 3)) {
      lines.push(
        `- **${rec.collectionName}** — ${rec.strategy}, shard key \`{ ${rec.shardKeySummary} }\` (~${formatCopilotDataGb(rec.estimatedHotStorageGb)} hot)`,
      );
    }
  }

  lines.push('', 'Open **Manager → Migration Cost Projection** to adjust the slider or review full sharding guidance.');
  return lines.join('\n');
}

/** Detects questions about the Manager dataset scale / raw data size setting. */
export function isCopilotDatasetScaleQuestion(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return /(?:what\s+is\s+(?:the\s+)?(?:current\s+)?(?:dataset\s+scale(?:\s*[—-]\s*raw\s+data(?:\s+size)?)?|raw\s+data\s+size)|(?:current\s+)?raw\s+data\s+size\??$)/i.test(
    trimmed,
  );
}
