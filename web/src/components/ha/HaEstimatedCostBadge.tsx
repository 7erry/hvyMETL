import { useMemo } from 'react';
import { estimateHaClusterHourlyUsd, estimateHaClusterMonthlyUsd } from '../../../../src/atlas/atlasHaCost.ts';
import type { HaClusterInputs } from '../../../../src/atlas/atlasClusterTopology.ts';
import { ATLAS_CLUSTER_TIERS, formatUsd } from '../../managerCostEstimate';

type HaEstimatedCostBadgeProps = {
  inputs: HaClusterInputs;
  recommendedTierId?: string;
};

export function HaEstimatedCostBadge({ inputs, recommendedTierId }: HaEstimatedCostBadgeProps) {
  const estimate = useMemo(() => {
    const tier =
      ATLAS_CLUSTER_TIERS.find((t) => t.id === inputs.instanceSize) ??
      ATLAS_CLUSTER_TIERS.find((t) => t.id === recommendedTierId);
    const monthlyPerNode = tier?.monthlyUsd ?? 0;
    const monthly = estimateHaClusterMonthlyUsd(inputs, monthlyPerNode);
    const hourly = estimateHaClusterHourlyUsd(monthly);
    return { monthly, hourly, tierLabel: tier?.label ?? inputs.instanceSize };
  }, [inputs, recommendedTierId]);

  return (
    <div className="ha-cost-badge" aria-label="Estimated Atlas monthly cost">
      <span className="ha-cost-badge__label">Est. Atlas compute</span>
      <strong className="ha-cost-badge__value">{formatUsd(estimate.monthly)} / mo</strong>
      <span className="ha-cost-badge__meta">
        ~{formatUsd(estimate.hourly)} / hr · {estimate.tierLabel} × billable nodes (illustrative)
      </span>
    </div>
  );
}
