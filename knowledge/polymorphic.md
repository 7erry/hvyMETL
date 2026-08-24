# Polymorphic Pattern

Store documents of similar-but-not-identical shapes in one collection,
distinguished by a type field.

## Problem it solves

SQL forces either one sparse table with many NULL columns or a tangle of
per-subtype tables joined to a base table. MongoDB's flexible schema lets all
variants live together, which is exactly what content blocks, multi-product
catalogs, and event streams need.

## Structure

```json
{ "_id": "blk-1", "pageId": "p-9", "type": "text", "body": "Hello" }
```

```json
{ "_id": "blk-2", "pageId": "p-9", "type": "image", "assetId": "a-4", "alt": "Diagram" }
```

```json
{ "_id": "blk-3", "pageId": "p-9", "type": "video", "assetId": "a-7", "durationSec": 91 }
```

## Querying

Reads that want everything for a page simply ignore the variation; reads that
need one variant filter on the type discriminator:

```javascript
db.blocks.find({ pageId: "p-9" });
db.blocks.find({ pageId: "p-9", type: "video" });
```

## Index spec

Lead compound indexes with the shared keys, optionally including the type:

```javascript
db.blocks.createIndex({ pageId: 1, type: 1 });
```

## Applicability rules

- The SQL source has subtype tables (class-table inheritance) or a type
  column plus many mostly-NULL variant columns.
- All variants are queried together through a shared access path.
- Pair with the Schema Versioning pattern when variant shapes evolve over time.

## Detection in hvyMETL

During **Refresh design**, `buildMigrationPlan()` in `src/design/patternSelector.ts`
runs `isPolymorphicTable()` on each SQL table (Pass 2). When it matches, the plan
records pattern id **`polymorphic`** — an **informational** flag (it does not by
itself change embed vs reference decisions).

### Algorithm

A table is polymorphic / single-table inheritance when **both** hold:

1. **Discriminator column** — a payload column whose name ends in `type`
   (regex `(^|_)type$`, case-insensitive). Examples: `block_type`, `entity_type`,
   `type`.
2. **Sparse variants** — at least **two nullable payload columns** other than the
   discriminator.

**Payload columns** exclude primary keys and foreign-key columns (`payloadColumns()`
in `patternSelector.ts`). A column like `page_id` does not count toward variants;
`text_body`, `image_alt`, and `video_duration_sec` do.

Implementation:

```typescript
// src/design/patternSelector.ts — isPolymorphicTable()
const discriminator = table.columns.find((column) => /(^|_)type$/i.test(column.name));
const nullableVariants = payloadColumns(table).filter(
  (column) => column.nullable && column.name !== discriminator.name,
);
return discriminator != null && nullableVariants.length >= 2;
```

### Example (CMS demo)

`examples/cms/cms.sql` — `content_blocks` with `block_type NOT NULL` plus nullable
`text_body`, `image_alt`, `video_duration_sec`, `embed_url`, etc. triggers
**polymorphic** on the `contentBlocks` collection.

### Where it surfaces

| Surface | Label |
| --- | --- |
| Migration plan / collection details | `polymorphic` |
| Manager review | “Polymorphic reference” |
| Transformation summary | Note about discriminator + nullable variant fields |
| Architecture Review (Copilot) | May describe [MongoDB Inheritance Schema Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/inheritance-schema-pattern/) — same shape, MongoDB Manual terminology |
| Workload profile inference | Adds weight toward the **`cms`** profile when any table matches |

### What is not auto-detected

- **Separate class-table inheritance** (base table + one table per subtype) is
  **not** merged automatically. Detection applies when the DDL already looks like
  **single-table inheritance** (discriminator + sparse nullables in one table).
- **Live Atlas** subtype discovery (sampling for `type`, `docType`, `_class`) is
  documented in [mongodb-inheritance-schema-pattern.md](mongodb-inheritance-schema-pattern.md)
  for reverse ETL / CDC — not the forward SQL heuristic above.

### Related patterns

- [mongodb-inheritance-schema-pattern.md](mongodb-inheritance-schema-pattern.md) —
  MongoDB-first inheritance modeling, reverse extraction, and Architecture Review
  doc links.
- [single-collection.md](single-collection.md) — peer entities with `docType` + `links[]`
  (different access pattern, not strict IS-A hierarchies).

See also [docs/05-design-engine.md](../docs/05-design-engine.md) decision table row
“Type column + ≥ 2 nullable variants”.
