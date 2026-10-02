import { electableSplit, type HaClusterInputs } from './atlasClusterTopology.js';

/** Total Atlas nodes billed (electable + read-only) across all regions. */
export function countHaBillableNodes(inputs: HaClusterInputs): number {
  const regionCount = electableSplit(inputs.electableNodeCount).length;
  const electableTotal = inputs.electableNodeCount;
  const readOnlyTotal = Math.max(0, inputs.readOnlyReplicasPerRegion) * regionCount;
  return electableTotal + readOnlyTotal;
}

/** Illustrative monthly cost = per-node tier price × billable node count. */
export function estimateHaClusterMonthlyUsd(inputs: HaClusterInputs, tierMonthlyUsd: number): number {
  if (!Number.isFinite(tierMonthlyUsd) || tierMonthlyUsd <= 0) return 0;
  return countHaBillableNodes(inputs) * tierMonthlyUsd;
}

export function estimateHaClusterHourlyUsd(monthlyUsd: number): number {
  return monthlyUsd / 730;
}
