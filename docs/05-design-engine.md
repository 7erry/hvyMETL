# 05 — The Design Engine

Sources: [`src/design/patternSelector.ts`](../src/design/patternSelector.ts),
[`src/design/designCommand.ts`](../src/design/designCommand.ts),
[`src/ml_engine/pipelinePatch.ts`](../src/ml_engine/pipelinePatch.ts)

## 1. High-Level Summary

The design engine is the brain of hvyMETL: a deterministic, rule-based planner that
maps *(SQL structure × workload telemetry)* to MongoDB design patterns and emits a
complete `migration-plan.json` — target collections, `$jsonSchema` validators, index
specs, deterministic `_id` derivation rules, and a per-decision justification citing
the knowledge document it is grounded in. It is intentionally **not** an LLM call:
the same inputs always produce the same plan, which makes migrations reviewable,
diffable, and testable. The pattern semantics follow MongoDB's
[Building with Patterns series](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).

An optional **ML-enhanced path** (`designFromModelWithMlEngine` in
[`pipelinePatch.ts`](../src/ml_engine/pipelinePatch.ts)) wraps the same
`buildMigrationPlan()` with telemetry-aware reranking, a performance critic gate, and
lessons-learned memory injection. See [17-ml-engine.md](17-ml-engine.md). For which AI models hvyMETL calls (embeddings, rerankers, and what is *not* a chat LLM), see [19-llm-and-models.md](19-llm-and-models.md).

## 2. Technical Details & Signature

### `buildMigrationPlan(model: SqlStructuralModel, profile: WorkloadProfile): MigrationPlan`

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | `SqlStructuralModel` | required | Tables, FKs, row counts, and relationship cardinality from introspection |
| `profile` | `WorkloadProfile` | required | The runtime-selected telemetry and tuning |

**Returns:** a `MigrationPlan` (pure function; no I/O). Key fields per
`CollectionPlan`: `name`, `sourceTable`, `mergedTables`, `idDerivation`
(`direct` / `composite` / `bucket`), `patterns[]` (with `knowledgeSource` citations),
`jsonSchema`, `indexes[]`, `embeddedArrays[]`, `extendedReferences[]`,
`computedFields[]`, and optional `bucket`.

### `runDesign(options: DesignOptions): Promise<MigrationPlan>`

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `options.sourcePath` | `string` | required | — | Path to the source SQLite database |
| `options.profile` | `WorkloadProfile` | required | — | Resolved workload profile |
| `options.outDir` | `string` | required | — | Receives `migration-plan.json` + `design-report.md` |
| `options.knowledgeDir` | `string` | required | — | Folder of pattern markdown documents |

Orchestrates introspect → retrieve → plan → write, and always closes the adapter.

### The decision table

| Structural signal | Telemetry condition | Pattern applied | Knowledge source |
| --- | --- | --- | --- |
| EAV child table (key/value payload) | always | **Attribute** (k/v array + compound index) | `attribute.md` |
| Junction table (two FKs, no payload) | always | embedded id array | `embed-vs-reference.md` |
| Timestamped child ≥ 10,000 rows | write-heavy or profile prefers bucket | **Bucket** collection + parent Computed counter | `bucket.md` |
| Child is a "hub" (other tables reference it) | always | reference (never embedded) | `embed-vs-reference.md` |
| Child has multiple parents | non-primary parent | reference + Computed counter | `embed-vs-reference.md` |
| Bounded child from measured stats (max ≤ 100/parent) | reads ≥ 70% | full **embed** (child collection dropped) | `embed-vs-reference.md` |
| Developer cardinality override (max 1–5000/parent) | explicit UI/API override | full **embed** for that relationship | `embed-vs-reference.md` |
| Unbounded or skewed child | reads ≥ 70% | **Subset** (newest 10) + overflow collection | `subset.md` |
| max/avg children ≥ 10 and max ≥ 50 | reads ≥ 70% | **Outlier** flag on the subset | `outlier.md` |
| Unbounded child | writes ≥ 60% | reference | `embed-vs-reference.md` |
| FK to small lookup table (≤ 5,000 rows, no FKs) | reads ≥ 70% | **Extended Reference** (≤ 3 hot columns) | `extended-reference.md` |
| Referenced/bucketed child sets | reads ≥ 70% | **Computed** `total<Child>` counter | `computed.md` |
| Self-referencing FK | always | **Tree** (`parentId` + index) | `tree.md` |
| Type column + ≥ 2 nullable variants | always | **Polymorphic** (informational) | `polymorphic.md` |
| Junction-linked entity pair | profile prefers single-collection or RPM ≥ 100k | **Single Collection** hub (`docType` + `links[]`) | `single-collection.md` |
| Dated table ≥ 5,000 rows | reads ≥ 70%, profile prefers archive, not ledger | **Archive** + mirror collection | `archive.md` |
| Every collection | always | **Schema Versioning** stamp | `schema-versioning.md` |

Tunable thresholds (constants at the top of `patternSelector.ts`):
`WRITE_HEAVY_PERCENT = 60`, `READ_HEAVY_PERCENT = 70`, `LOOKUP_TABLE_MAX_ROWS = 5000`,
`FIREHOSE_MIN_ROWS = 10000`, `SUBSET_LIMIT = 10`, `EXTENDED_REFERENCE_MAX_COLUMNS = 3`,
`OUTLIER_SKEW_RATIO = 10`, `OUTLIER_MIN_CHILDREN = 50`, `BUCKET_WINDOW_MINUTES = 60`,
`ARCHIVE_MIN_ROWS = 5000`, `ARCHIVE_AFTER_DAYS_DEFAULT = 1825`, `SINGLE_COLLECTION_MIN_RPM = 100000`,
`DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN = 5000`.

### Dependencies

Internal: `src/adapters/sqlite.ts`, `src/rag/*` (for the report's cited context),
`src/utilities/naming.ts`. External: none beyond the adapter's driver.

## 3. Edge Cases & Error Handling

- **The 16MB guard.** No rule can produce an unbounded embedded array: unbounded
  children either become Subset (hard-capped at 10), a Bucket collection
  (window-bounded), or a reference. This is the "Avoid the Monolith" constraint.
- **Developer override guard.** Migration Studio can send `cardinalityOverrides` for
  DDL-only relationships when CSV/live stats are unavailable. Overrides with max
  `1-5000` are treated as explicit bounded developer intent and can force a full
  embed for that relationship; values above `5000` remain unbounded. CSV and SQLite
  introspection remain preferred because they measure actual fan-out.
- **Double-embedding prevention.** A child with two required parents (e.g.
  `affinities` → `profiles` *and* `items`) embeds only under its primary parent
  (first FK); other parents get a counter — the same rows are never duplicated into
  two collections.
- **Hub protection.** A child that other tables reference (e.g. `products` under
  `brands`) is never embedded into its lookup parents; denormalization flows the
  *other* way via Extended Reference.
- **Absorbed-table cleanup.** Pass 4 drops standalone collections for fully-embedded
  tables, but never drops a Subset overflow collection — the full history must
  survive.
- **Tables without a PK** fall back to their first column for `_id` derivation.
- **Skew uses max, not avg.** Outlier detection compares `maxChildrenPerParent`
  against the average so one celebrity-sized account is enough to trigger protection.

## 4. Code Breakdown

1. **Pass 1 — classification.** Identify firehose tables to bucket and prepare the
   `absorbedTables` set that tracks children folded into parents.
2. **Pass 2 — per-table planning** (sorted by FK count so lookups plan first):
   - `planChildRelationships` walks every relationship where the table is the
     *parent* and applies the decision table above, accumulating embedded arrays,
     computed counters, and pattern decisions.
   - `planLookupReferences` walks the table's own FKs and duplicates up to three
     hot, human-facing columns (`name`, `tier`, `status`...) from qualifying lookup
     tables, keeping the id for fan-out updates.
   - Tree, Polymorphic, and Schema Versioning checks append their decisions.
   - Indexes are emitted for every retained FK field plus the Attribute pattern's
     `{ "attributes.k": 1, "attributes.v": 1 }` compound index.
3. **Pass 3 — overflow collections.** Every `overflowCollection` named by a Subset
   array is guaranteed to exist, indexed by its join column.
4. **Pass 4 — absorption filter.** Fully-embedded source tables lose their standalone
   collections (except overflow backs).
5. **`runDesign`** wraps the pure planner with I/O: introspection, RAG retrieval for
   the report (top 8 chunks), and the two artifacts. The plan is machine-consumed by
   the ETL and repogen; the report is the human review surface.

## 5. Usage Example

```bash
npm run hvymetl -- design --source examples/catalog/catalog.db --profile catalog --out out/catalog
```

Expected output:

```text
Introspected 7 tables, 7 relationships.
Retrieval strategy: lexical BM25 (no API key configured).
Planned 5 collections.
Wrote out/catalog/migration-plan.json
Wrote out/catalog/design-report.md
```

Excerpt from the resulting plan for `products` (skewed reviews trigger
Subset + Outlier; the brand lookup triggers Extended Reference):

```json
{
  "name": "products",
  "embeddedArrays": [
    { "field": "attributes", "sourceTable": "product_attributes", "joinColumn": "product_id" },
    { "field": "recentReviews", "sourceTable": "reviews", "joinColumn": "product_id",
      "subsetLimit": 10, "overflowCollection": "reviews" }
  ],
  "extendedReferences": [
    { "field": "brand", "sourceTable": "brands", "viaColumn": "brand_id",
      "lookupColumns": ["name", "country", "website"] }
  ],
  "computedFields": [
    { "field": "totalReviews", "initialExpression": "COUNT(*) FROM reviews WHERE product_id = products.id" }
  ]
}
```

## 6. Refactoring / Optimization Suggestions

- The MongoDB series' *Approximation* and *Document Versioning* patterns are not yet
  automated; an `--enable-approximation` rule for high-RPM counters and a revision
  table detector would complete the set.
- `computeRanges` in the ETL calls `adapter.introspect()` per collection for row
  counts; passing the model from `runEtl` would avoid repeated catalog scans on large
  sources (see [06-etl.md](06-etl.md)).
- Thresholds are compile-time constants; promoting them to optional CLI flags
  (`--subset-limit`, `--firehose-rows`) would allow tuning without a rebuild.
