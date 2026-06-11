# Embedding vs Referencing

The foundational MongoDB modeling decision: store related data inside the
parent document (embed) or in a separate collection linked by an id (reference).

## When to embed

- The child data is always read together with the parent ("data that is
  accessed together should be stored together").
- The relationship is one-to-few and naturally bounded (an order's line
  items, a user's shipping addresses).
- The child rows never need to be queried independently of the parent.

```json
{
  "_id": "order-1001",
  "customerId": "cust-42",
  "items": [
    { "sku": "SKU-1", "qty": 2, "price": 19.99 },
    { "sku": "SKU-9", "qty": 1, "price": 5.5 }
  ]
}
```

## When to reference

- The relationship is one-to-many with unbounded growth (a device's sensor
  readings, a user's activity events). Unbounded embedded arrays eventually
  hit the 16MB document limit and make every write rewrite a huge document.
- The child is shared by many parents (many-to-many).
- The workload is write-heavy: small documents keep writes fast and avoid
  document moves and lock contention under high requests-per-minute.

```json
{ "_id": "reading-77", "deviceId": "dev-3", "ts": "2026-01-01T00:00:00Z", "value": 21.4 }
```

## Applicability rules

- Bounded one-to-few (max children <= ~100) AND read-heavy: embed.
- Unbounded one-to-many OR write-heavy (writes >= 60%): reference, or use the
  Bucket pattern for time-series.
- Large bounded arrays that are mostly read in part: embed a capped subset
  (see Subset pattern) and reference the rest.

## Anti-pattern guard

Never allow an embedded array to grow without limit under stated RPM and data
growth. If average children per parent times average child size approaches
megabytes, reference or bucket instead.
