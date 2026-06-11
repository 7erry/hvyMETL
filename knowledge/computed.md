# Computed Pattern

Pre-calculate aggregates (counts, sums, averages, ratings) at write time and
store them on the document, instead of recomputing them on every read.

## Problem it solves

Read-heavy workloads that show "total orders", "average rating", or "view
count" would otherwise run an aggregation over thousands of child rows on
every page view. Computing once per write and reading a stored field turns an
O(n) aggregation into an O(1) field access.

## Structure

```json
{
  "_id": "prod-7",
  "name": "Widget Pro",
  "ratingCount": 1284,
  "ratingSum": 5392,
  "ratingAvg": 4.2,
  "totalUnitsSold": 90412
}
```

## Maintaining computed fields atomically

Always use atomic modifiers; never read-modify-write, which corrupts counters
under concurrent load:

```javascript
db.products.updateOne(
  { _id: productId },
  { $inc: { ratingCount: 1, ratingSum: stars } }
);
```

Derive `ratingAvg` either in an aggregation pipeline update or lazily at read
time from sum/count.

## Applicability rules

- Reads of the aggregate vastly outnumber writes to the underlying data
  (reads >= 70%), OR the aggregate is expensive (large child sets).
- Slightly stale aggregates are acceptable; for exact-at-all-times numbers
  use transactions or recompute on read.

## ETL implication

The migration script must initialize computed fields by aggregating the SQL
source during extraction (for example `COUNT(*)` and `SUM(...)` grouped by
parent id), so documents arrive with correct starting values and the
application only ever applies `$inc` deltas afterward.
