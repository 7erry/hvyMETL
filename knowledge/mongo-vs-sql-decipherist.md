# SQL vs MongoDB — Production Mental Model (Curated Summary)

Curated summary of external production guidance for teams migrating from SQL to
MongoDB. This is **not** a full reproduction of the source article — it distills
themes that align with hvyMETL's design engine, Query Translator, and Copilot
guidance.

**Source:** [MongoDB vs SQL in 2026 — The Decipherist](https://thedecipherist.com/articles/mongo_vs_sql/)
(Published February 16, 2026). Attribution required; treat as opinionated advocacy
grounded in production experience, not neutral vendor documentation.

## How this doc fits hvyMETL

| Theme in the article | hvyMETL counterpart |
| --- | --- |
| JSON/BSON end-to-end; avoid ORM impedance | [migration-principles.md](migration-principles.md) Rule 4; repository generator uses native driver |
| Embed related data; transactions as last resort | Rule 2; [embed-vs-reference.md](embed-vs-reference.md); pattern selector embed decisions |
| Intentional denormalization / snapshots | Rule 3; [extended-reference.md](extended-reference.md) |
| Aggregation-first reads; compute in the database | Rule 5; Query Translator (`translateSQLToMongo`) |
| Flexible schema + versioned rollout | Rule 6; [schema-versioning.md](schema-versioning.md) |
| `$match` early in pipelines | Copilot aggregation guidance; index-aware query plans |

Use this document when RAG or Copilot needs **SQL-to-Mongo mindset** context beyond
individual Building with Patterns entries — especially for Query Translator output,
Architecture Review trade-off sections, and migration guardrails.

## Core thesis: the JSON pipeline

SQL applications often receive JSON, decompose it into normalized rows, then rejoin
and serialize back to JSON on every request. MongoDB stores the same shape the API
already uses: BSON documents map directly to JSON/JavaScript objects.

**hvyMETL implication:** The design engine should resist 1-to-1 table-to-collection
mapping when FK-linked tables are always read together. See
[migration-principles.md](migration-principles.md) Rules 1–3 and the meta/line-item
checklist.

## Production principles (curated)

### Prefer document-local atomicity over multi-collection transactions

MongoDB supports multi-document ACID transactions, but frequent cross-collection
transactions often signal relational modeling on a document database. Fold
dependent rows into the parent document when the read path is always combined.

**When transactions remain appropriate:** True cross-entity invariants (e.g. debit/credit
across two account documents) where neither side should embed the other.

### Denormalize on purpose, not by accident

Duplicate lookup fields or embed snapshot data when reads dominate and the duplicated
fields are either immutable (orders, invoices) or refreshed via change streams
(Extended Reference). SQL's fear of duplication is less relevant when writes are
localized and reads avoid `$lookup`.

### Reads: aggregation pipelines, not application reassembly

Prefer `$match` → `$sort` → `$project` (and `$limit` / `$skip` when paginating) inside
the database. Shape UI-ready fields with `$addFields` or `$project` rather than
fetching wide documents and filtering in Node.

**Pipeline order matters:** Place `$match` and selective `$project` as early as possible
so indexes can prune documents before expensive stages. `$lookup` belongs late and
only when embedding was correctly rejected during design.

### Writes: consistent bulk patterns

The source article advocates `bulkWrite` for uniform error handling and transactional
batching. hvyMETL repository output follows native-driver idioms; Copilot may suggest
`bulkWrite` when translating multi-row SQL `INSERT`/`UPDATE`/`DELETE` batches.

### Schema: flexible by default, strict when needed

Schema-less does not mean schema-less forever. Add fields without downtime; use
schema version discriminators during rollout ([schema-versioning.md](schema-versioning.md)).
Apply `$jsonSchema` validation when invariants must be enforced at the database layer
— but avoid rigid validators that block additive evolution during migration.

### Skip heavy ODM layers for hot paths

Thick ORM/ODM wrappers recreate object-relational impedance mismatch. Prefer the
official driver and pass BSON-shaped documents through the API layer.

## SQL → MongoDB quick reference (Query Translator context)

Condensed mapping for Copilot and Query Translator — not an exhaustive command list.
See the source article for the full side-by-side table.

| SQL concept | MongoDB equivalent |
| --- | --- |
| `SELECT … FROM t WHERE …` | `db.collection('t').aggregate([{ $match: … }, …])` |
| `SELECT col1, col2` | `{ $project: { col1: 1, col2: 1 } }` |
| `ORDER BY a DESC, b ASC` | `{ $sort: { a: -1, b: 1 } }` |
| `LIMIT n OFFSET m` | `{ $skip: m }, { $limit: n }` |
| `COUNT(*)` | `countDocuments({})` or `{ $count: 'n' }` |
| `DISTINCT col` | `distinct('col')` or `$group` |
| `IN (…)` | `{ $in: […] }` |
| `LIKE '%x%'` | `{ $regex: /x/i }` on the field |
| `IS NOT NULL` | `{ $exists: true, $ne: null }` |
| `BETWEEN a AND b` | `{ $gte: a, $lte: b }` on one field |
| `AND` of different fields | implicit in one `$match` object |
| `AND` on same field twice | `{ $and: [ … ] }` or combined operators |
| `OR` | `{ $or: [ … ] }` (array of conditions) |
| `INNER JOIN` / `LEFT JOIN` | `$lookup` + `$unwind` (prefer embed at design time) |
| `UNION ALL` | `$unionWith` (Query Translator emits this for compatible SQL) |
| `GROUP BY` + aggregates | `$group` with `_id` and accumulators |
| `CREATE INDEX` | `createIndex({ field: 1 })` |
| `INSERT` / `UPDATE` / `DELETE` | `bulkWrite` with `insertOne`, `updateOne`/`updateMany`, `deleteOne`/`deleteMany` |

**Implicit `$and` rule:** A plain `$match` object ANDs its keys. Use explicit `$and`
when the same field appears in multiple conditions that cannot be merged (e.g. two
separate `$regex` clauses on one field).

## Common SQL criticisms reframed (brief)

These points appear in the source article; hvyMETL cites them for migration coaching,
not as universal truths:

- **"No transactions"** — Multi-document transactions exist; prefer single-document
  atomicity when possible.
- **"No joins"** — `$lookup` exists; prefer embedding or Extended Reference when
  reads are hot.
- **"Schema chaos"** — Discipline via schema versioning and optional validation, not
  mandatory rigid schemas on day one.
- **"16 MB limit"** — Real constraint; use Subset, Bucket, Outlier, or Archive patterns
  when embeds grow unbounded.

## Caveats for hvyMETL users

- The article is **advocacy**, not a substitute for [MongoDB Manual](https://www.mongodb.com/docs/manual/)
  documentation linked in Architecture Review.
- Relational warehouses, strict reporting cubes, and heavy cross-domain ad hoc SQL
  may still favor SQL or a hybrid (operational MongoDB + analytics sink).
- hvyMETL automates schema **design** and **translation**; operational choices (ODM vs
  driver, exact write API) remain team preferences within Rule 4 bounds.

## Applicability rules

- Retrieve during **RAG design** when workload profile suggests SQL-origin schema
  (many narrow tables, meta/EAV tables, join-heavy read paths).
- Retrieve during **Copilot Query Translator** sessions when explaining why JOINs
  became `$lookup` or why embed was chosen over join.
- Retrieve during **Architecture Review** when discussing denormalization, transaction
  scope, or aggregation-first read models.
- Do **not** treat this doc as authoritative for MongoDB feature availability — verify
  against current Manual docs for transactions, `$lookup`, `$jsonSchema`, and Atlas
  features.

## See also

- [migration-principles.md](migration-principles.md) — hvyMETL's canonical migration rules
- [embed-vs-reference.md](embed-vs-reference.md) — embed vs reference decision framework
- [extended-reference.md](extended-reference.md) — controlled denormalization
- [schema-versioning.md](schema-versioning.md) — zero-downtime evolution
