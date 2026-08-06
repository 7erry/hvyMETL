/**
 * Atlas sizing section template for Agent Copilot architecture reviews.
 * Ground numbers in Manager **Dataset scale** / hot storage from system context.
 */

export const ARCHITECTURE_REVIEW_ATLAS_SIZING_SECTION = `
**§8 MongoDB Atlas cluster sizing** (collapsible — required whenever Manager dataset scale or schema storage estimates are available; omit only if no scale data exists at all)

Open with one sentence: *Based on MongoDB Atlas sizing best practices, here is the structured recommendation breakdown for your **{hot dataset GB}** hot dataset* (use **active/hot storage GB** from Manager dataset scale when present; otherwise total raw data GB with a note).

Inside the \`<details>\` block, use \`###\` subheadings and include **all five parts**:

**1. RAM & Cluster Tier Sizing (The "Working Set" Rule)**
- State the rule: MongoDB performs best when the entire working set (hot data + index working set) fits in RAM.
- **RAM Requirement:** \`{hot GB} (hot data) + estimated ~20–30% for indexes\` → show a summed **minimum RAM** range (e.g. ~20–22 GB for 16.7 GB hot).
- **Tier Recommendation:** Compare the **next lower** and **recommended** Atlas tiers (e.g. M40 vs M50, or M50 vs M60 — pick tiers bracketing the RAM requirement using Manager **illustrative tier** when available).
  - Undersized tier: explain WiredTiger cache eviction / disk paging and higher read latency if RAM < working set.
  - **Recommended Starting Tier:** name tier (RAM / vCPU), justify holding full hot dataset + indexes + query overhead.

**2. Storage & Operational Headroom**
- Never size disk from raw uncompressed data alone.
- Include this markdown table (fill with computed numbers):

| Sizing Variable | Best Practice Multiplier | Estimated Requirement |
| --- | --- | --- |
| Raw Uncompressed Data | Base size | {GB} |
| Indexes | ~20–30% of data size | {GB range} |
| WiredTiger Compression | ~30–50% reduction on disk | qualitative note |
| Operational Headroom | Keep disk utilization < 70% | prevents IOPS throttling |
| Minimum Disk Target | ≥ 3× data size minimum | {provisioned GB range} |

- Recommend **Atlas Auto-Expanding Storage**.

**3. Replica Set & Backup Sizing**
- **Replica Set:** minimum **3-node** replica set (Primary + Secondaries); each node identical RAM/CPU (state total footprint, e.g. 3× M50).
- **Backups:** Atlas Continuous Backups / PITR; snapshots billed separately — account for **oplog size** and write change velocity.

**4. Architecture: Single Replica Set vs. Sharding**
- **Sharding Verdict:** *Do NOT shard* or *Evaluate sharding* with clear reasoning vs hot dataset size.
- For single replica set: note vertical scale headroom (e.g. up to M300+ / TB-class on one RS when appropriate).
- **When to reconsider sharding:** bullet list — write throughput saturates primary CPU/IOPS; dataset exceeds vertical storage limits (typically > ~4 TB); geo-distributed data isolation (Global Clusters).

**5. Next Steps & Validation**
- Deploy recommended tier in non-production.
- Run representative workload testing (e.g. \`mongoperf\`, custom load suites).
- Monitor **WiredTiger Cache Fill Ratio**, **Disk IOPS**, and page faults in Atlas Cloud Manager under peak traffic.

Do **not** include hourly Atlas pricing or cost breakdown in this section. Cite **Manager dataset scale** and **sharding recommendations** from system context when present.
`.trim();
