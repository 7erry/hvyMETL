# Bucket Pattern

Group many small time-series measurements into one document per source per
time window, instead of one document per measurement.

## Problem it solves

Write-heavy time-series workloads (IoT sensors, clickstreams, metrics) create
millions of tiny documents. One document per reading bloats indexes, wastes
storage on repeated metadata, and makes range scans slow.

## Structure

One bucket document per (source, window). Measurements append into an array;
summary fields are maintained alongside with atomic operators.

```json
{
  "_id": "dev-3|2026-01-01T00:00",
  "deviceId": "dev-3",
  "windowStart": "2026-01-01T00:00:00Z",
  "windowMinutes": 60,
  "count": 360,
  "sum": 7704.1,
  "min": 18.2,
  "max": 24.9,
  "measurements": [
    { "ts": "2026-01-01T00:00:10Z", "value": 21.4 }
  ]
}
```

## Writing to a bucket atomically

```javascript
db.readings.updateOne(
  { _id: `${deviceId}|${windowStart}` },
  {
    $push: { measurements: { ts, value } },
    $inc: { count: 1, sum: value },
    $min: { min: value },
    $max: { max: value },
    $setOnInsert: { deviceId, windowStart, windowMinutes: 60 }
  },
  { upsert: true }
);
```

## Applicability rules

- Workload is write-heavy (writes >= 60%) with timestamped child rows.
- Data growth is high (gigabytes per week or more).
- Window size should bound the bucket: pick a window where measurements per
  bucket stays in the hundreds-to-low-thousands so the document stays far
  below 16MB.

## Benefits under high RPM

- One upsert per measurement touches one small-ish document, keeping write
  latency flat and reducing index entries by orders of magnitude.
- Dashboards read pre-aggregated count/sum/min/max without scanning raw rows.

## Index specs

Compound index on the grouping key plus window start:

```javascript
db.readings.createIndex({ deviceId: 1, windowStart: -1 });
```
