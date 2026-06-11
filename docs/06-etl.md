# 06 — Parallel Pattern-Aware ETL

Sources: [`src/etl/splitter.ts`](../src/etl/splitter.ts),
[`src/etl/shaper.ts`](../src/etl/shaper.ts),
[`src/etl/worker.ts`](../src/etl/worker.ts),
[`src/etl/runEtl.ts`](../src/etl/runEtl.ts)

## 1. High-Level Summary

The ETL stage turns a migration plan into pattern-compliant CSV chunks using up to
eight worker threads, each extracting a non-overlapping slice of the source. The
"pattern formatting layer" does its shaping *inside* SQL — pre-joined Extended
Reference columns, initialized Computed counters, capped Subset arrays, grouped
Bucket documents — so workers simply stream rows to disk with constant memory. A
`DRY_RUN` safety gate limits extraction to exactly 3 chunks of 1,000 records with
structural validation logs before any production-scale run.

## 2. Technical Details & Signature

### `splitRange(min: number, max: number, chunkCount: number): ChunkRange[]`

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `min` / `max` | `number` | required | Smallest/largest key value present in the table |
| `chunkCount` | `number` | required | Desired number of ranges (worker slots) |

**Returns:** contiguous half-open ranges `[start, end)` whose union is exactly
`[min, max]` and whose pairwise intersection is empty — the no-duplicates/no-misses
invariant proven in `splitter.test.ts`.

### `splitTimeRangeAligned(minEpoch, maxEpoch, chunkCount, windowMinutes): ChunkRange[]`

Same contract over epoch seconds, with every boundary snapped to a whole bucket
window. **Why it matters:** when chunk edges align to window edges, every
*(source, window)* bucket falls entirely inside one chunk — no two workers can emit
partial versions of the same bucket document.

### `buildShapedQuery(collection: CollectionPlan, model: SqlStructuralModel): ShapedQuery`

**Returns:**

| Field | Type | Description |
| --- | --- | --- |
| `sql` | `string` | SELECT with two positional placeholders (range start/end) |
| `columns` | `string[]` | CSV header names in SELECT order |
| `idFields` | `string[]` | Row keys joined with `\|` to form the deterministic `_id` |
| `splitColumn` | `string` | Column the range filter applies to |
| `splitsOnTime` | `boolean` | `true` for bucket collections (epoch ranges) |

Column-header conventions match the csvToAtlas modeling rules exactly:
`brand.name` (dotted → nested object), `recentReviews[]` (JSON array cell),
plain headers (coerced scalars).

### Worker protocol (`worker.ts`)

`ExtractTask` (parent → worker): `{ dbPath, sql, params: [start, end], outFile,
columns, idFields }`. `ExtractResult` (worker → parent): `{ kind: 'done' | 'error',
outFile, rowCount, message? }`. Workers are persistent pool members; each opens its
**own** SQLite connection (handles must never cross threads).

### `runEtl(options: EtlOptions): Promise<void>`

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `options.planPath` | `string` | required | — | Path to `migration-plan.json` |
| `options.outDir` | `string` | required | — | Receives `csv/*.csv` and `etl-manifest.json` |
| `options.dryRun` | `boolean` | required | — | Safe ingestion gate (also forced by `DRY_RUN=true`) |
| `options.workers` | `number` | required | — | Pool size, clamped to `MAX_PARALLEL_WORKERS = 8` |

Other constants: `TARGET_CHUNK_ROWS = 20000` (production chunk sizing),
`DRY_RUN_CHUNKS = 3`, `DRY_RUN_LIMIT = 1000`.

### Dependencies

| Dependency | Kind | Used for |
| --- | --- | --- |
| `node:worker_threads` | built-in | The parallel worker pool |
| `better-sqlite3` | external | Per-worker lazy row cursors |
| `src/utilities/csv.ts`, `src/utilities/ids.ts` | internal | CSV dialect + `_id` derivation |
| `DRY_RUN` (env) | optional | Forces the safety gate regardless of flags |

## 3. Edge Cases & Error Handling

- **Empty tables** produce zero chunks (`getKeyRange` → `null`) rather than a
  degenerate `[NaN, NaN)` range.
- **Sparse key spaces:** `splitRange` never makes more chunks than distinct key
  values; a 3-key table asked for 8 chunks gets ≤ 3.
- **Bucket-split correctness over PK-split speed:** bucket collections deliberately
  range on *time*, not the primary key, accepting a full-table scan per chunk in
  exchange for the no-partial-buckets guarantee. Verified on the IoT example: 60,000
  measurements → 10,055 buckets, zero duplicate `_id`s across 8 parallel chunks.
- **Backpressure:** when `stream.write()` returns `false`, the worker awaits
  `'drain'` before pulling the next row — the O(1)-RAM guarantee holds even when the
  disk is slower than SQLite.
- **Worker errors are isolated:** a failing chunk reports
  `{ kind: 'error', message }`; the run completes the remaining chunks, logs the
  failures, and exits non-zero.
- **Dry-run LIMIT after GROUP BY:** for bucket queries the 1,000-record cap applies
  to bucket rows (post-grouping), which is the meaningful unit being validated.

## 4. Code Breakdown

1. **Plan + model load.** `runEtl` reads the plan and re-introspects the source
   (the shaper needs column lists for `json_object(...)` construction).
2. **Shaping (`shaper.ts`).** For document collections the SELECT is assembled from
   five parts: camelCased base columns; hidden `__idPartN` aliases (PK values the
   worker consumes for `_id` and drops from the CSV); `LEFT JOIN`ed Extended
   Reference columns under dotted aliases; correlated `COUNT(*)` subqueries that
   initialize Computed counters; and `json_group_array(json_object(...))` cells for
   embeds — with `ORDER BY ... DESC LIMIT n` inside the subquery for Subset caps.
   Bucket collections instead `GROUP BY (source, window)` with
   `strftime`-floored window starts.
3. **Range computation.** Production chunk count =
   `min(workers, ceil(rowCount / 20000))`; dry-run = exactly 3 ranges with
   `LIMIT 1000` appended.
4. **Pool execution.** N worker loops share one task queue; each `dispatch` posts a
   task and awaits the reply, so a worker always handles one task at a time and the
   pool naturally load-balances across collections.
5. **Manifest.** Results aggregate into `etl-manifest.json` — files, row counts,
   columns, and a ready-to-paste `importCommand` per collection — plus the
   structural validation log on stdout.

## 5. Usage Example

```bash
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot --dry-run
```

Expected output (abridged):

```text
ETL DRY RUN (3 chunks x 1,000 records per collection)
Source: examples/iot.db | Profile: iot | Workers: 8
  sensorReadings: 3 chunk(s) split on recorded_at (window-aligned time ranges)
Structural validation:
  sensorReadings: 3,000 rows in 3 file(s)
    columns: _id, deviceId, windowStart, windowMinutes, count, measurements[], schemaVersion
Extracted 17 chunk(s) in 0.1s. Manifest: out/iot/etl-manifest.json
Dry run complete. Re-run without --dry-run (and DRY_RUN unset) for the full extraction.
```

A produced bucket row (`_id` = `deviceId|windowStart`):

```csv
1|2026-05-25T00:00:00Z,1,2026-05-25T00:00:00Z,60,2,"[{""id"":12228,""sensorId"":1,...}]",1
```

## 6. Refactoring / Optimization Suggestions

- Bucket chunks scan the full table per range (`strftime` filter defeats the PK
  index); adding a `CREATE INDEX ... ON (recorded_at)` probe — or precomputing epoch
  bounds to a PK range — would speed very large sources.
- `computeRanges` re-introspects per collection for a row count; reuse the model
  already loaded in `runEtl` (one-line change).
- Worker errors currently fail the run at the end; a `--fail-fast` flag could
  terminate the pool on first error for very long extractions.
