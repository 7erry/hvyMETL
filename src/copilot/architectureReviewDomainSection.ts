/**
 * Architecture Review domain checklist — operational limits, schema efficiency, cluster topology.
 */

export const ARCHITECTURE_REVIEW_DOMAIN_SECTION = `
**Architecture review scope (mandatory framing in §1 Executive summary)**

Open §1 with one sentence stating that this review tests **operational limits**, **schema efficiency**, and **cluster topology** before production load exposes costly structural flaws — grounded in how access patterns map to MongoDB's storage engine mechanics (WiredTiger cache, multikey indexes, oplog, document relocation).

Include this **Review domain** table in §1 (after the verdict callout or comparison table):

| Review domain | Focus artifacts | Common red flags |
| --- | --- | --- |
| **Data model** | Access-pattern matrix (read vs write per entity), migration-plan JSON schemas, cardinality stats | Unbounded embedded arrays; relational schemas ported 1:1 to BSON without embed/reference justification |
| **Performance** | Planned compound indexes, \`explain("executionStats")\` samples on hot paths, slow-query patterns | Missing compound indexes; COLLSCAN; in-memory sorts; unindexed aggregations; redundant indexes bloating RAM |
| **Infrastructure** | Topology / tier sizing, shard-key candidates, replica-set layout, §9 Well-Architected deployment | Monotonically increasing shard keys; public internet DB access; missing private endpoints or RBAC |
| **Operations** | DR / backup posture, security baseline, write concern & read preference | Default \`w: 1\` for critical writes; missing TLS/RBAC; unmonitored oplog growth |

**§2 Data modeling & schema strategy** (collapsible — expand beyond entity list)
- **Embedding vs referencing:** Justify normalized references versus denormalized embeds using read-to-write ratio, join frequency, and document lifecycle from schema context. Cite workload telemetry when available.
- **Unbounded array anti-patterns:** Audit arrays that grow without cap (logs, events, open-ended child history) — document fragmentation, relocation cost, and 16 MB BSON risk; recommend Subset, Bucket, Time-Series, Archive, or separate collections.
- **Schema validation:** Verify collection-level \`$jsonSchema\` enforcement (\`maxItems\`, \`additionalProperties\`, required fields) for governance in dynamic schemas.

**§5 Technical & operational justification** (collapsible — storage engine depth)
- Map hot paths to WiredTiger working-set fit, document growth/relocation, oplog write amplification, and index RAM footprint.
- Cross-reference §2 cardinality and §6 index plans.

**§6 Indexing & query performance** (collapsible — in addition to search strategy)
- **ESR rule adherence:** Evaluate each compound index against Equality → Sort → Range ordering; flag mis-ordered keys.
- **Memory footprint:** Estimate index size vs RAM; call out redundant or overlapping indexes.
- **Query plan analysis:** Recommend \`explain("executionStats")\` on representative filters; eliminate COLLSCAN, blocking sorts, and full-collection aggregations without supporting indexes.

**§8 Cluster topology & high availability** (within existing Atlas sizing section)
- **Shard key evaluation:** When sharding is considered, scrutinize cardinality, write distribution, and query isolation — reject low-cardinality or monotonic-only keys unless mitigated with hashed/truncated components.
- **High availability:** Verify replica-set geography, election timeouts, read preferences for analytics vs primary writes, and \`w: "majority"\` for durability-sensitive paths.
`.trim();
