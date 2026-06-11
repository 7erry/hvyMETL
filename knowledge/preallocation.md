# Pre-allocation Pattern

Create the document structure (with placeholder values) ahead of time when
the shape and keys are predictable, so high-velocity writes become cheap
in-place updates.

## Problem it solves

Write-heavy workloads that fill in predictable slots (a day of minute-level
metrics, a seat map, a daily rollup row) pay upsert-race and
document-growth costs if every write might create structure. Pre-allocating
the skeleton turns every write into a simple `$set`/`$inc` on an existing
path.

## Structure

A daily metrics document pre-allocated with one slot per hour:

```json
{
  "_id": "site-1|2026-06-11",
  "siteId": "site-1",
  "date": "2026-06-11",
  "hourly": {
    "0": { "views": 0, "clicks": 0 },
    "1": { "views": 0, "clicks": 0 }
  }
}
```

## Writing

```javascript
db.dailyMetrics.updateOne(
  { _id: `${siteId}|${date}` },
  { $inc: { [`hourly.${hour}.views`]: 1 } }
);
```

## Applicability rules

- Massive-write workloads (writes >= 70%) with predictable slot keys
  (time buckets, fixed grids).
- Combine with the Bucket and Computed patterns for analytics rollups.
- Pre-allocate only structures whose full size is modest; never pre-allocate
  unbounded structures.
