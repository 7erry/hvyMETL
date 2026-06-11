# Schema Versioning Pattern

Stamp every document with a `schemaVersion` field so old and new document
shapes can coexist in one collection while the application migrates lazily.

## Problem it solves

Relational migrations require ALTER TABLE downtime across the whole table.
With documents, you can ship a new shape immediately and upgrade old
documents only when they are next touched — zero downtime, no big-bang
backfill.

## Structure

```json
{ "_id": "cust-1", "schemaVersion": 1, "phone": "555-1234" }
```

```json
{
  "_id": "cust-2",
  "schemaVersion": 2,
  "contacts": [ { "kind": "mobile", "value": "555-9876" } ]
}
```

## Application logic

```javascript
function normalizeCustomer(doc) {
  if (doc.schemaVersion === 1) {
    return { ...doc, schemaVersion: 2, contacts: [{ kind: "phone", value: doc.phone }] };
  }
  return doc;
}
```

Write the upgraded shape back with an atomic update the next time the
document is modified.

## Applicability rules

- Any long-lived collection whose shape will evolve (effectively all of them).
- Critical systems (ledgers) where coordinated downtime is unacceptable.
- Single View systems merging sources that arrive in waves with different
  shapes.

## Migration implication

The ETL stamps `schemaVersion: 1` on every migrated document so future shape
changes have a baseline to upgrade from.
