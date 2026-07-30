# Time Series Pattern (MongoDB Native)

Store high-volume measurements in a **MongoDB time series collection** instead of
one regular document per row or application-level bucket documents.

## Problem it solves

IoT, metrics, and event firehoses produce millions of timestamped rows. Regular
collections inflate index size; hand-rolled bucket documents add application
complexity. MongoDB 5.0+ time series collections use **server-managed bucketing**,
compression, and optimized storage for sequential writes.

## When hvyMETL chooses it

- Table has a **timestamp column** and row count above the firehose threshold.
- Workload profile lists **`time-series`** in preferred patterns (IoT, Real-Time Analytics).
- Profile is **write-heavy** or explicitly prefers time series over embed/reference.

Otherwise the engine may fall back to the **Bucket** pattern (application-level windows)
when `bucket` is preferred without `time-series`.

## createCollection options

Maps to the [Manual time series procedures](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-procedures/):

| Plan field | MongoDB option |
| --- | --- |
| `timeSeries.timeField` | BSON date on every measurement (from SQL timestamp column) |
| `timeSeries.metaField` | Optional series key (often the FK to device/sensor/parent) |
| `timeSeries.granularity` | `seconds`, `minutes`, or `hours` |
| `timeSeries.expireAfterSeconds` | Optional TTL for automatic deletion |

Example (from migration plan artifacts):

```javascript
db.createCollection('sensorReadings', {
  timeseries: {
    timeField: 'recordedAt',
    metaField: 'sensorId',
    granularity: 'seconds',
  },
  expireAfterSeconds: 7776000,
});
```

## Document shape

One SQL row → one time series **measurement document** (flat fields). The
`timeField` and optional `metaField` are top-level fields; other columns map
to additional measurement attributes.

## Querying

Use range filters on `timeField` and equality on `metaField` for per-series
windows. Aggregations (`$group`, `$bucketAuto`) run on time series collections
like normal collections; see Manual **Query a Time Series Collection**.

## vs Bucket pattern

| | Native time series | Bucket pattern |
| --- | --- | --- |
| Storage | Server bucket columns | App-defined window documents |
| Writes | insertOne per measurement | upsert + `$push` into arrays |
| Best for | MongoDB 5.0+, Atlas, sustained ingest | Custom rollups in-document, pre-6.0 semantics |

## Index specs

When `metaField` is set, MongoDB automatically creates a compound index on
`{ metaField: 1, timeField: 1 }`. The migration plan still lists this index
for operators and `repogen`.
