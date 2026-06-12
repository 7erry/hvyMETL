# Archive Pattern

Move infrequently accessed historical documents to a separate collection (or
external storage) so the active working set stays fast.

Official reference: [MongoDB Manual — Archive Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/archive/)

## Problem it solves

Keeping years of historical rows in the same hot collection as recent traffic
bloats indexes and slows routine queries. Archiving cold data preserves the
embedded document shape while shrinking the active footprint.

## Structure

Active collection (recent sales):

```json
{
  "_id": "sale-9001",
  "customerName": "Hiroshi Tanaka",
  "totalAmount": 89.97,
  "date": "2025-01-30T10:15:00Z",
  "schemaVersion": 1
}
```

Archive collection (`sales_archive`) — same embedded shape, older `date`:

```json
{
  "_id": "sale-4001",
  "customerName": "Aisha Khan",
  "totalAmount": 899.99,
  "date": "2018-11-20T15:45:00Z",
  "schemaVersion": 1
}
```

## Operational sweep

Match documents older than a cutoff, `$merge` into the archive collection, then
delete from the active collection. Archived documents should be **fully embedded**
so queries never chase references across time boundaries.

## Applicability rules

- The SQL source has a reliable timestamp or date column representing document age.
- Row volume is large enough that a cold tier helps (typically thousands+ rows).
- The workload is read-heavy on recent data; ledger/financial sources that must
  retain all rows in one place should **not** archive automatically.
- Pair with Schema Versioning so archive and active collections migrate together.
- MongoDB Atlas Online Archive is an alternative when external object storage is preferred.

## Index spec

Index the age column on both active and archive collections:

```javascript
db.sales.createIndex({ date: -1 });
db.sales_archive.createIndex({ date: -1 });
```

## hvyMETL automation

The design engine adds an `archive` block on eligible collections and plans a
mirror archive collection with the same `$jsonSchema`. Initial ETL loads both;
a scheduled `$merge` job moves cold documents in production.
