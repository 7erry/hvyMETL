# 07 — The csvToAtlas Import CLI

Sources: [`src/import/cli.ts`](../src/import/cli.ts),
[`src/import/analyze.ts`](../src/import/analyze.ts),
[`src/import/coerce.ts`](../src/import/coerce.ts),
[`src/import/importer.ts`](../src/import/importer.ts)

## 1. High-Level Summary

The import CLI is the load stage: it converts CSV files into nested, type-coerced
MongoDB documents and writes them to Atlas with concurrency-safe semantics — any row
carrying a deterministic `_id` becomes an idempotent `replaceOne` upsert, so the same
chunk imported twice (or two chunks imported in parallel) always converges on exactly
one document. It supports four shapes: single CSV, partitioned chunk CSVs (the ETL's
output), related CSVs merged by a join field, and parent/child embedding.

## 2. Technical Details & Signature

### Command contract

```bash
npm run import-cli -- <file.csv...> [collection] [flags]
```

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `--analyze` | boolean | optional | `false` | Analysis-only run; no `MONGODB_URI` needed |
| `--join <field>` | string | optional | inferred | Field linking related CSVs |
| `--parent <file.csv>` | string | optional | — | Parent file for embed mode |
| `--embed <file:field>` | string, repeatable | optional | — | Embed a child CSV as an array field |
| `--drop` | boolean | optional | `false` | Drop the collection first (explicit opt-in only) |
| `--db <name>` | string | optional | `MONGODB_DB` → `csv_to_atlas` | Target database |
| `--write-concern <w>` | `"1" \| "majority"` | optional | `1` | Durability level |
| `--journal` | boolean | optional | `false` | Wait for the on-disk journal |

| Environment variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | for imports | Atlas connection string (never logged) |
| `MONGODB_DB` | optional | Default database name |

### `analyzeCsvFiles(files: ParsedCsvFile[]): CsvAnalysis`

**Returns** the documented analysis JSON: `files` (headers + row counts),
`commonFields` ranked (id-looking fields first), `suggestedJoinField`,
`suggestedCollectionName`, and `arePartitions` — `true` when every file shares an
identical header signature, which is how the ETL's chunk files are recognized as
partitions of one dataset rather than relational CSVs to join.

### `rowToDocument(headers: string[], cells: string[]): CsvDocument` (`coerce.ts`)

The modeling rules, shared verbatim with the ETL writer:

| Header / cell shape | Result |
| --- | --- |
| `address.city` | nested object `{ address: { city } }` |
| `items.0.sku` | indexed array `items[0].sku` |
| `tags[]` with `["a","b"]` | JSON-parsed array at `tags` |
| empty cell | `null` |
| `42` / `true` / `{...}` | number / boolean / parsed JSON |
| `_id` column | kept **as a string**, exactly as written |
| digit string beyond `Number.MAX_SAFE_INTEGER` | kept as string (id precision) |

### `runImport(options: ImportOptions): Promise<ImportResult>`

**Returns:**

| Field | Type | Description |
| --- | --- | --- |
| `collectionName` | `string` | Collection written to |
| `insertedCount` | `number` | Documents written (inserts + upserts) |
| `upsertedCount` / `modifiedCount` | `number` | Upsert vs. replace breakdown |
| `indexesCreated` | `string[]` | Indexes created (join field) |
| `recommendedIndexes` | `{ field, reason }[]` | `*Id` and timestamp fields worth indexing |
| `schemaSummary` | `Record<string, string[]>` | Field → observed types (200-doc sample) |
| `merge` | object | Mode + skipped-row statistics |

### Dependencies

`mongodb` (official driver), `dotenv`, internal `src/utilities/csv.ts`. Bulk writes
go out in unordered batches of `BULK_BATCH_SIZE = 1000`.

## 3. Edge Cases & Error Handling

- **Missing `MONGODB_URI`:** a clear operator message and exit 1 — unless
  `--analyze`, which never needs a connection.
- **Skipped-row accounting:** join mode counts rows missing the join key
  (`skippedMissingJoinKey`); embed mode also counts children whose parent does not
  exist (`skippedMissingParent`). Both are surfaced in the result JSON so silent data
  loss is impossible.
- **Null-tolerant merging:** in join mode, later files enrich the document but a
  `null` cell never overwrites real data from an earlier file.
- **`--drop` is explicit-only** and tolerates a not-yet-existing collection
  (`.catch(() => undefined)`).
- **Malformed `--embed` spec** (`file.csv` without `:field`) exits immediately with
  the expected format.
- **Numeric-looking `_id`s** survive as strings — `"42"` and `42` would otherwise be
  different upsert keys on re-import.
- **Unordered bulk writes** (`ordered: false`) let a batch continue past individual
  document errors and maximize parallel-chunk throughput.

## 4. Code Breakdown

1. **Parse & analyze first.** Every run begins with `readCsvFile` + `analyzeCsvFiles`;
   `--analyze` stops there and prints the JSON (the skill-recommended dry step).
2. **Mode selection in `buildDocuments`:** embed mode when `--parent`+`--embed`+join
   are present; join mode for multiple *differently-shaped* files; otherwise straight
   concatenation (single file or partitions).
3. **Deterministic `_id` fallback:** in join/embed modes documents missing `_id`
   adopt the join value, so even hand-made CSVs get idempotent upserts.
4. **Bulk write strategy:** documents with an `_id` become
   `replaceOne({ _id }, replacement, { upsert: true })`; documents without one become
   plain inserts. This is what makes parallel chunk imports race-free: last write
   wins on identical content, and identical content is guaranteed by deterministic
   extraction.
5. **Post-import affordances:** the join field is indexed immediately
   (`createIndex` is idempotent), and `recommendIndexes` flags `*Id` and
   timestamp-looking fields with reasons, mirroring the result-review guidance.

## 5. Usage Example

```bash
# 1. Inspect before writing (no connection needed):
npm run import-cli -- out/iot/csv/sensorReadings.chunk*.csv --analyze
# -> { "suggestedJoinField": "_id", "suggestedCollectionName": "sensorreadings",
#      "arePartitions": true, ... }

# 2. Import the partitioned chunks (requires MONGODB_URI in .env):
npm run import-cli -- out/iot/csv/sensorReadings.chunk0.csv \
  out/iot/csv/sensorReadings.chunk1.csv sensorReadings --write-concern 1
```

Expected result JSON (abridged):

```json
{
  "collectionName": "sensorReadings",
  "insertedCount": 2511,
  "upsertedCount": 2511,
  "modifiedCount": 0,
  "indexesCreated": [],
  "recommendedIndexes": [
    { "field": "deviceId", "reason": "Looks like a foreign reference; equality lookups will need an index." },
    { "field": "windowStart", "reason": "Timestamp field; range queries and sorts will need an index." }
  ],
  "merge": { "mode": "partitions", "skippedMissingJoinKey": 0, "skippedMissingParent": 0 }
}
```

## 6. Refactoring / Optimization Suggestions

- Files are read fully into memory before document building; a streaming CSV reader
  would extend the importer to multi-GB files (the ETL side already streams).
- Join/embed grouping uses in-memory `Map`s keyed by join value — fine for chunked
  imports, but a `--low-memory` mode could spill groups to temporary files.
- The recommended indexes could be auto-created behind a `--create-recommended` flag,
  closing the loop with the plan's index specs.
