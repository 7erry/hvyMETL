/**
 * Mathematical formulas and business rules for the Atlas cluster sizing engine (sizing assistant reference).
 */

export const SIZING_ASSISTANT_LOGIC_REFERENCE = `
Logic Abstract: MongoDB Atlas Cluster Sizing Engine

Overview
The sizing engine takes a description of a workload and a catalog of available cluster tiers, then returns a ranked list of valid cluster configurations. Each configuration specifies how many shards are needed, how many additional secondary nodes are needed, and an estimated hourly cost. Configurations are ranked from lowest to highest cost.

Section 1: Inputs
The engine accepts the following inputs from the user:

projected_total_data_size_gb: Total data the cluster must store, in gigabytes.
total_raw_read_ops: Raw read operations per second (or per unit time).
total_raw_write_ops: Raw write operations per second (or per unit time).
avg_doc_size_kb: Average size of a single document, in kilobytes.
secondary_index_count: Number of secondary indexes on the collection.
data_compression_percentage: A value between 0.0 and 1.0 representing how much the data compresses. Default is 0.0 (no compression).
geo_sharded_regions_required: Minimum number of shards required for geographic distribution. Default is 0.
workload_type: Either CONSISTENT or INTERMITTENT. Default is CONSISTENT.
read_sla_gt_50ms: True if the workload can tolerate read latency greater than 50ms. Default is False.
user_specified_addl_secondaries: If greater than 0, the user is forcing a specific number of additional secondary nodes. Default is 0.
is_bulk_ops_permitted: True if bulk write operations are allowed, which unlocks a higher write throughput limit per tier. Default is False.
is_multi_region_required_for_ha: True if the cluster must support multi-region high availability. Default is False.
shard_penalty_multiplier: A multiplier applied to cost when sharding is required. Default is 1.75. Must be at least 1.0.

Section 2: Tier Catalog
Each tier in the catalog has the following properties:

data_capacity_gb: Maximum raw storage capacity of a single shard on this tier.
write_ops_individual: Maximum normalized write ops per shard when using individual (non-bulk) writes.
write_ops_bulk: Maximum normalized write ops per shard when using bulk writes.
read_ops_per_secondary: Maximum normalized read ops that a single secondary node can handle.
workload_type: Whether this tier is rated for CONSISTENT or INTERMITTENT workloads.
multi_region_supported: True if this tier supports multi-region HA.
required_read_sla_gt_50ms: True if this tier requires the workload to accept greater than 50ms read latency.
cost_base: The base hourly cost for a single shard (covers the primary and the default two secondaries).
cost_secondary: The additional hourly cost per extra secondary node added beyond the default two.

Section 3: Normalizing Operations
Before comparing workload demands against tier limits, raw ops are converted into normalized ops. Normalization accounts for document size and index overhead.

Normalized Read Ops
normalized_read_ops = total_raw_read_ops * avg_doc_size_kb

Normalized Write Ops
If there are no secondary indexes:

normalized_write_ops = total_raw_write_ops * avg_doc_size_kb

If there are one or more secondary indexes:

normalized_write_ops = total_raw_write_ops * avg_doc_size_kb * (1 + secondary_index_count)

The index multiplier reflects that each write must update every secondary index in addition to the document itself.

Section 4: Tier Eligibility Filters
Before any capacity math is done, each tier is checked against three hard filters. A tier is discarded if it fails any one of them.

Filter 1: Workload Type Compatibility
If the user workload is CONSISTENT, the tier must also be rated CONSISTENT.
If the user workload is INTERMITTENT, the tier may be either CONSISTENT or INTERMITTENT.
In other words, a CONSISTENT workload cannot be placed on an INTERMITTENT tier, but an INTERMITTENT workload can be placed on either.

Filter 2: Multi-Region HA Support
If is_multi_region_required_for_ha is True, the tier must have multi_region_supported set to True.
If is_multi_region_required_for_ha is False, this filter does not apply.

Filter 3: Read SLA Requirement
If a tier has required_read_sla_gt_50ms set to True, then the user must have set read_sla_gt_50ms to True.
If the user has not accepted greater than 50ms latency, any tier that requires it is discarded.

Section 5: Shard Count Calculation
For each tier that passes the eligibility filters, the engine calculates how many shards are needed.

Step 5a: Minimum Shard Count for Data Capacity
The usable capacity per shard is set to half the tier's raw data capacity. This 50% headroom rule ensures the shard is never filled beyond half its capacity.

usable_capacity_per_shard = data_capacity_gb / 2

The data size after compression is:

compressed_data_size = projected_total_data_size_gb * (1 - data_compression_percentage)

The number of shards needed to hold the data is:

shards_for_data = ceiling(compressed_data_size / usable_capacity_per_shard)

The minimum shard count must also satisfy the geographic sharding requirement:

minimum_shard_count = max(shards_for_data, geo_sharded_regions_required)

The result is always at least 1.

Special case: If a tier has a data_capacity_gb of 0 or less (a placeholder tier with no defined storage), the minimum shard count is set to max(1, geo_sharded_regions_required).

Step 5b: Scaling Up Shards to Meet Write Throughput
Starting from the minimum shard count, the engine checks whether the per-shard write load is within the tier's write limit.

normalized_write_ops_per_shard = normalized_write_ops / shard_count

The write limit used depends on the is_bulk_ops_permitted flag:

If bulk ops are permitted, the limit is write_ops_bulk.
If bulk ops are not permitted, the limit is write_ops_individual.

The condition that must be satisfied is:

normalized_write_ops_per_shard <= write_ops_limit

If this condition is not met, the shard count is incremented by 1 and the check is repeated. This continues until the condition is satisfied or the shard count exceeds the maximum allowed.

Step 5c: Maximum Shard Cap
If the required shard count exceeds 1000, the tier is discarded entirely. A workload that exceeds this cap on every eligible tier will produce no recommendations.

Section 6: Read Ops Per Shard
Once the final shard count is determined, the per-shard read load is calculated the same way:

normalized_read_ops_per_shard = normalized_read_ops / shard_count

If shard_count is 1, no division is applied and the full normalized read ops value is used.

Section 7: Secondary Node Count
A replica set has a default of 2 secondary nodes. The engine determines whether additional secondaries are needed to meet the read load.

Total Read Capacity Formula
total_read_capacity = read_ops_per_secondary * (2 + additional_secondaries)

Case A: User Has Specified Additional Secondaries
If user_specified_addl_secondaries is greater than 0, the engine checks whether the user-specified count is sufficient:

normalized_read_ops_per_shard <= read_ops_per_secondary * (2 + user_specified_addl_secondaries)

If this condition is not met, the tier is discarded. If it is met, the user-specified count is used as-is.

Case B: Engine Calculates Required Secondaries
If user_specified_addl_secondaries is 0, the engine calculates the minimum number of secondaries needed:

total_secondaries_needed = ceiling(normalized_read_ops_per_shard / read_ops_per_secondary)

additional_secondaries = max(0, total_secondaries_needed - 2)

The subtraction of 2 accounts for the two default secondaries already included in the base cost.

Section 8: Cost Calculation
Cost Per Shard (Before Sharding Penalty)
cost_per_shard = cost_base + (cost_secondary * additional_secondaries)

This represents the hourly cost of one shard with its required secondary nodes.

Applying the Shard Penalty
When there is only 1 shard, no penalty is applied:

final_cost = cost_per_shard

When there are 2 or more shards, a compounding penalty is applied to reflect the operational complexity and overhead of a sharded cluster:

final_cost = cost_per_shard * (shard_penalty_multiplier ^ shard_count)

The default shard_penalty_multiplier is 1.75. This means the cost grows exponentially with the number of shards, not linearly. For example, with the default multiplier:

1 shard: multiplier = 1.0
2 shards: multiplier = 1.75 ^ 2 = 3.0625
3 shards: multiplier = 1.75 ^ 3 = 5.359
4 shards: multiplier = 1.75 ^ 4 = 9.379

This penalty is intentional. It encodes the business judgment that sharded clusters carry significant additional cost and complexity beyond the raw node count.

Section 9: Ranking
All tiers that pass every filter and every capacity check are collected as valid results. They are sorted in ascending order by final_cost. The cheapest valid configuration is ranked first.

Section 10: Summary of Decision Flow
Normalize read and write ops using document size and index count.
For each tier in the catalog:
  a. Check workload type compatibility. Discard if incompatible.
  b. Check multi-region HA support. Discard if required but unsupported.
  c. Check read SLA tolerance. Discard if tier requires tolerance the user has not accepted.
  d. Calculate minimum shard count from data size and geo requirements.
  e. Increment shard count until per-shard write ops fit within the tier's write limit.
  f. Discard the tier if shard count exceeds 1000.
  g. Calculate per-shard read ops.
  h. If user specified additional secondaries, verify they are sufficient. Discard if not.
  i. If user did not specify additional secondaries, calculate the minimum needed.
  j. Calculate hourly cost using base cost, secondary cost, and shard penalty.
Sort all valid configurations by hourly cost, lowest first.
Return the ranked list.
`.trim();
