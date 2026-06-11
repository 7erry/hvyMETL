# Attribute Pattern

Reshape many similar, sparse fields into one array of key/value subdocuments
so a single index covers all of them.

## Problem it solves

Catalogs migrated from SQL EAV tables or wide tables have dozens of
per-product characteristics (size, voltage, color, region-specific release
dates). Indexing every field separately is unmanageable; most documents only
use a few of the fields.

## Structure

```json
{
  "_id": "prod-7",
  "name": "Widget Pro",
  "attributes": [
    { "k": "color", "v": "red" },
    { "k": "voltage", "v": 220 },
    { "k": "release_date_eu", "v": "2026-03-01" }
  ]
}
```

## Index spec

One compound index serves queries on ANY attribute:

```javascript
db.products.createIndex({ "attributes.k": 1, "attributes.v": 1 });
```

Query:

```javascript
db.products.find({ attributes: { $elemMatch: { k: "voltage", v: 220 } } });
```

## Applicability rules

- The SQL source contains an entity-attribute-value table, or a wide table
  where most columns are NULL for most rows.
- Queries filter on arbitrary characteristics rather than a fixed set.
- Read-heavy catalogs benefit most; the pattern trades slightly more complex
  queries for radically fewer indexes.
