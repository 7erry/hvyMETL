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
