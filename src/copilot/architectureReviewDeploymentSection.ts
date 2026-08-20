/**
 * Atlas deployment options for Agent Copilot architecture reviews.
 * Aligns output with the MongoDB Atlas Well-Architected Framework gold standard.
 */

export const ARCHITECTURE_REVIEW_DEPLOYMENT_SECTION = `
**§9 Atlas deployment options (Well-Architected Framework)** (collapsible — required in every collective Architecture Review)

Frame MongoDB Atlas's **gold-standard** deployment architecture against the [MongoDB Well-Architected Framework](https://www.mongodb.com/docs/atlas/architecture/current/) — optimizing for **zero downtime**, **strict network isolation**, **automated scaling**, and **enterprise-grade security**. Tailor each item to Manager dataset scale and §8 tier verdict; tag bullets **Required**, **Recommended**, or **Future** when multi-region or sharding exceeds current workload needs.

**High availability & regional resilience**
- **Multi-region replica sets:** Deploy a **5-node** replica set distributed across **three Availability Zones (AZs)** in a primary region, with **electable secondary nodes in a secondary region**. This configuration supports automatic failover within seconds (**RTO**) and **zero data loss (\`RPO = 0\`)** during a full regional outage when using \`w: "majority"\` write concern.
- **Dual auto-scaling:** Enable **reactive** auto-scaling (live CPU and RAM consumption) and **predictive** auto-scaling to adjust cluster tiers ahead of cyclical traffic spikes.

**Zero-trust network & identity architecture**
- **Private connectivity:** Route all application database traffic exclusively through cloud-native private endpoints (**AWS PrivateLink**, **Azure Private Link**, or **GCP Private Service Connect**) — avoid public internet exposure for production workloads.
- **Granular identity management:** Pair **IP Access Lists** with **Role-Based Access Control (RBAC)** and integrate corporate **SSO/SAML** for administrative users.

**Encryption & data governance**
- **Storage & transit security:** Require **TLS 1.3** for all in-transit traffic; use **Customer-Managed Keys** (AWS KMS, Azure Key Vault, or GCP Cloud KMS) for envelope encryption at rest.
- **Field-level protection:** Use **Client-Side Field Level Encryption (CSFLE)** or **Queryable Encryption** to cryptographically secure sensitive fields (PII, financial data) before write operations.

**Scalability, backup, and operations** — include this table (adapt rows to schema context; cross-reference §8 for tier math — do not duplicate RAM sizing here):

| Architectural pillar | Gold-standard configuration | Core operational benefit |
| --- | --- | --- |
| **Compute & tiering** | Dedicated tier (**M30+**) with dynamic IOPS | Eliminates noisy neighbors; ensures consistent throughput |
| **Data partitioning** | Multi-shard cluster with ranged/hashed shard keys | Enables horizontal scaling for datasets exceeding ~2 TB |
| **Disaster recovery** | Continuous Cloud Backups + **PITR** | Point-in-time recovery; cross-region snapshot duplication |
| **Observability** | Native Atlas Metrics + external APM / SIEM | Stream telemetry to Datadog, Splunk, or Azure Monitor for real-time auditing |

Link first mention of Well-Architected pillars to \`atlasWellArchitected\`, \`atlasArchitectureReliability\`, and \`atlasArchitectureSecurity\` in the doc registry when cited.
`.trim();
