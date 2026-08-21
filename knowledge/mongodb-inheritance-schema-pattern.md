# MongoDB Inheritance Schema Pattern

Model **polymorphic documents in a single collection** where subtypes share a
common base shape and add variant-specific fields, distinguished by a
**discriminator** field (for example `type`, `docType`, or `_class`).

Official reference: [MongoDB Manual — Inheritance Schema Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/inheritance-schema-pattern/)

## Pattern overview

Relational databases often express inheritance with **class-table inheritance**
(a shared base table plus one table per subtype) or **single-table inheritance**
(one wide table with nullable subtype columns and a type column). MongoDB keeps
all subtypes in **one collection** and uses document flexibility instead of JOINs.

### Structure

Base fields live on every document; subtype-only fields appear only on matching
variants:

```json
{
  "_id": "evt-1001",
  "type": "pageView",
  "sessionId": "s-42",
  "occurredAt": { "$date": "2026-08-21T12:00:00Z" },
  "path": "/products/shoes"
}
```

```json
{
  "_id": "evt-1002",
  "type": "purchase",
  "sessionId": "s-42",
  "occurredAt": { "$date": "2026-08-21T12:05:00Z" },
  "orderId": "ord-88",
  "amountCents": 12999
}
```

The discriminator (`type` above) tells readers and validators which fields are
in play. Optional fields that exist on only some subtypes are **sparse** — they
may be absent rather than set to `null`.

### Querying

Filter on the discriminator when you need one subtype; omit it when scanning the
whole hierarchy:

```javascript
db.events.find({ sessionId: "s-42" });
db.events.find({ type: "purchase", occurredAt: { $gte: ISODate("2026-08-01") } });
```

### Indexing

Compound indexes should lead with high-selectivity shared keys, then the
discriminator when queries are subtype-specific:

```javascript
db.events.createIndex({ sessionId: 1, occurredAt: -1 });
db.events.createIndex({ type: 1, occurredAt: -1 });
```

Pair with [Schema Versioning](schema-versioning.md) when subtype shapes evolve
over time, and with [`$jsonSchema` validation](https://www.mongodb.com/docs/manual/core/schema-validation/)
using `oneOf` / `anyOf` per subtype when you need server-side enforcement.

### Inheritance vs Polymorphic (in hvyMETL terms)

| Concept | Inheritance Schema Pattern | hvyMETL `polymorphic` pattern |
| --- | --- | --- |
| Origin | MongoDB-first modeling of class hierarchies | SQL **single-table** or **class-table** inheritance detected at design time |
| Discriminator | `type`, `_class`, `docType`, etc. | SQL `*_type` column or merged subtype tables |
| Field shape | Shared base + sparse subtype fields | Nullable variant columns in one SQL table |
| Close cousin | [Single Collection](single-collection.md) uses `docType` for **peer** entities, not strict IS-A hierarchies | Same single-collection storage, different access pattern |

See also [polymorphic.md](polymorphic.md) for the SQL-to-Mongo forward-migration
rules hvyMETL automates today.

---

## Impact on hvyMETL architecture

hvyMETL's primary pipeline is **SQL → MongoDB** (design → ETL → csvToAtlas →
repogen). Inheritance-aware MongoDB collections also matter for **reverse**
flows, **analytics exports**, and **CDC** when Atlas is the system of record or
a dual-write target.

### Extraction

When a MongoDB collection (or change stream) is the **source**, treat it as one
logical stream with a **variant schema**, not as N fixed relational tables.

1. **Discover the discriminator** — Scan a sample (or collection schema / `$jsonSchema`
   validator) for stable type fields: `type`, `docType`, `_class`, `kind`, or
   domain-specific names (`blockType`, `eventName`). Record the allowed enum values.
2. **Build a union schema** — Collect:
   - **Base fields**: keys present on ≥ threshold of documents (e.g. 80%) across all types.
   - **Per-type extensions**: keys that appear predominantly when `discriminator = T`.
   - **Nested objects and arrays**: flatten paths explicitly (`address.city`) rather than
     assuming every subtype shares the same nesting.
3. **Align with hvyMETL design artifacts** — If the collection was produced by hvyMETL,
   read `migration-plan.json` for the collection's `$jsonSchema`, pattern id
   (`polymorphic`, `single-collection`), and ETL column list. The plan is the
   authoritative map from SQL class-table / single-table sources to Mongo shape.
4. **Single stream, multiple logical entities** — Extraction workers should emit
   rows/documents tagged with `{ discriminator, subtypeSchemaVersion }` metadata
   so downstream transforms can route without re-parsing BSON per stage.

For **SQL → Mongo** (forward migration), the design engine detects inheritance
shapes via `isPolymorphicTable()` (`*_type` column + ≥2 nullable variant columns)
and class-table subtype tables, then collapses them into one collection per
[polymorphic.md](polymorphic.md). ETL's `buildShapedQueriesForCollection()` and
Single Collection `docType` injection follow the same discriminator principle.

### Transformation

Mapping inheritance collections **out** of MongoDB to relational or columnar
sinks requires an explicit **physicalization strategy**:

#### Relational destinations

| Strategy | When to use | hvyMETL-oriented notes |
| --- | --- | --- |
| **Single-table inheritance (STI)** | Few subtypes, moderate sparsity, warehouse prefers one fact table | One destination table; discriminator column + nullable columns for all subtype fields; matches how SQL CMS demos (`content_blocks` + `block_type`) are modeled before Mongo migration. |
| **Class-table inheritance (CTI)** | Many subtypes, heavy sparsity, strong typing per subtype | Base table (shared columns) + one table per `type` value; JOIN on `_id` or business key. Mirror of SQL class-table sources hvyMETL merged on the way in. |
| **Typed views** | Consumers want SQL ergonomics without duplicating storage | Materialized views or ELT models filtered `WHERE type = 'purchase'` over a bronze STI table. |

**Nested structures:** flatten to dotted columns in STI/CTI only when the target
engine supports semi-structured types; otherwise JSON/VARIANT columns for
subtype-specific blobs (Snowflake `VARIANT`, BigQuery `JSON`, Redshift `SUPER`).

#### Columnar sinks (Parquet / Iceberg)

1. **Bronze layer** — Append-only documents as JSON or a wide struct with optional
   fields; preserve `_id`, discriminator, and `_changeStreamToken` / cluster time for CDC.
2. **Silver layer** — Partition by **discriminator** (or high-cardinality shard key +
   date) when subtype volume is skewed; use Iceberg **identity** or **truncate**
   transforms on `type` for file layout.
3. **Schema evolution** — New subtype fields must be **additive** at the Parquet
   level (optional columns). Use Iceberg schema evolution or Parquet logical types;
   never require every subtype to backfill new columns before writes land.
4. **Gold layer** — Optional per-subtype Iceberg tables or DuckDB views for
   analytics, fed from silver STI.

hvyMETL's CSV shaper and `json_object` nested shaping (see `src/etl/shaper.ts`,
`src/utilities/csvShaper.ts`) are the reference implementation for **deterministic
column ordering** when collapsing variant SQL rows — apply the same discipline in
reverse when exploding Mongo documents to CSV/Parquet.

### Change Data Capture (CDC)

MongoDB [change streams](https://www.mongodb.com/docs/manual/changeStreams/)
emit one event stream per collection. Inheritance collections produce **mixed-schema
events** on a single topic:

```json
{
  "operationType": "insert",
  "fullDocument": {
    "_id": "evt-1003",
    "type": "refund",
    "sessionId": "s-42",
    "orderId": "ord-88",
    "reason": "damaged"
  }
}
```

**CDC guidelines for hvyMETL connectors and pipeline developers:**

1. **Never assume a fixed column set per event** — Route on `fullDocument.type`
   (or `updateDescription.updatedFields` for partial updates) before mapping to
   relational or Iceberg rows.
2. **Handle partial updates** — Subtype-only fields may appear only in
   `updateDescription`; merge with a cached document or a silver-table upsert
   keyed by `_id`.
3. **Deletes and replaces** — Propagate `operationType: delete` to all CTI child
   tables or mark tombstones in STI; inheritance does not imply cascade unless
   the sink enforces it.
4. **Resume tokens** — Persist resume tokens per collection (not per subtype);
   one change stream covers the whole hierarchy.
5. **Validation drift** — When `$jsonSchema` uses `oneOf` per subtype, a new
   `type` value is a **contract change**: bump pipeline schema version, add silver
   columns, and backfill before promoting to gold.
6. **Extended Reference refresh** — hvyMETL uses change streams in architecture
   guidance for denormalized lookup fields ([migration-principles.md](migration-principles.md)
   Rule 3). Inheritance + denormalized base fields require the same refresh rules
   per subtype.

---

## Transformation guidelines

Best practices for hvyMETL connector and pipeline developers parsing inheritance
collections:

### Discriminator parsing

- Resolve the discriminator path once per collection (`type` vs nested `metadata.kind`).
- Normalize values to a stable enum (case, legacy aliases) before routing.
- Treat missing discriminator as **`unknown`** quarantine, not as base type —
  log and metrics, do not silently drop.
- For hvyMETL-generated data, prefer the same name the plan used (`docType` for
  Single Collection hubs, SQL `*_type` names preserved in camelCase when applicable).

### Optional and variant fields

- **Sparse vs null** — Absent field ≠ `null`. Columnar writers should use optional
  Parquet fields; SQL STI should use NULL only when the source explicitly stored null.
- **Type conflicts** — Same path with different BSON types across subtypes (e.g.
  `value` string vs number) requires a promoted type (STRING) or separate columns
  (`value_string`, `value_number`) in STI.
- **Arrays of variants** — Polymorphic arrays (e.g. CMS `blocks[]` with mixed
  `type`) need per-element discrimination; do not flatten to a single struct without
  an index or `blocks[].type` path.

### Nested structures

- Cap flatten depth in connectors; keep deep subtrees as JSON/VARIANT columns.
- Preserve MongoDB field names through naming utilities (`mongoFieldNameForColumn`
  conventions) when round-tripping with hvyMETL repogen output.
- For reverse embeds and nested lookup objects (see design engine `reverseJoin`),
  nested inheritance sub-documents should stay as BSON/JSON blobs unless the target
  schema explicitly expands them.

### Validation and testing

- Golden tests: one fixture document per `type` value plus edge cases (missing
  discriminator, empty subtype fields, schema version mismatch).
- Compare extracted union schema against `$jsonSchema` in `migration-plan.json`
  when the collection was hvyMETL-migrated.
- Architecture Review copilot links use `inheritancePattern` in
  `architectureReviewDocLinks.ts` — cite the manual page when documenting subtype
  design in reviews.

### Performance

- Index-aware extraction: filters should include discriminator when selective.
- Avoid scatter-gather to all CTI tables when the CDC event includes a known `type`.
- Large STI Parquet files: partition by `(type, date)` to avoid scanning irrelevant
  subtype columns in query engines.

---

## Related hvyMETL artifacts

| Artifact | Relevance |
| --- | --- |
| [polymorphic.md](polymorphic.md) | Forward SQL → Mongo polymorphic / single-table inheritance |
| [single-collection.md](single-collection.md) | `docType` discriminator for peer entities in one collection |
| [schema-versioning.md](schema-versioning.md) | Evolving subtype shapes without downtime |
| [migration-principles.md](migration-principles.md) | Change streams for denormalized field refresh |
| `src/design/patternSelector.ts` | `isPolymorphicTable()` detection |
| `src/etl/shaper.ts` | `docType` column injection for Single Collection exports |
| `examples/` CMS domain | `content_blocks` / `block_type` inheritance demo |
