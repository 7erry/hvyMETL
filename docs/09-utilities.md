# 09 — Core Utilities

Sources: [`src/utilities/csv.ts`](../src/utilities/csv.ts),
[`src/utilities/ids.ts`](../src/utilities/ids.ts),
[`src/utilities/naming.ts`](../src/utilities/naming.ts)

## 1. High-Level Summary

Three small, dependency-free modules underpin every stage: a single CSV dialect
shared by the ETL writer and the import reader (so a round trip is lossless by
construction), deterministic `_id` derivation (the foundation of idempotent,
race-free parallel imports), and SQL→MongoDB naming conversions. They are pure
functions — no I/O, no state — and are the most heavily unit-tested code in the
project.

## 2. Technical Details & Signature

### `csv.ts`

| Function | Signature | Description |
| --- | --- | --- |
| `escapeCsvValue` | `(value: unknown) => string` | RFC-4180 quoting: wraps in `"` when the value contains a comma, quote, or newline; doubles inner quotes; `null`/`undefined` → empty cell |
| `formatCsvRow` | `(values: unknown[]) => string` | Joins escaped cells with `,` and appends `\n` |
| `parseCsv` | `(text: string) => string[][]` | Character-by-character state machine; handles quoted cells, escaped quotes, embedded newlines, and `\r\n` |

### `ids.ts`

| Export | Signature | Description |
| --- | --- | --- |
| `ID_PART_SEPARATOR` | `'\|'` | Constant separating composite key parts |
| `deriveId` | `(parts: unknown[]) => string` | Joins stringified key parts: `deriveId([7, '2026-01-01'])` → `"7\|2026-01-01"` |

**Why deterministic ids matter:** every ETL worker computes the same `_id` for the
same source row, so parallel csvToAtlas tasks performing
`replaceOne({ _id }, doc, { upsert: true })` cannot create duplicates or race — any
interleaving converges on one identical document.

### `naming.ts`

| Function | Example | Rule |
| --- | --- | --- |
| `toCamelCase` | `'unit_price'` → `'unitPrice'` | Splits on `_`; segments already containing uppercase are preserved as-is |
| `toPascalCase` | `'sensor_readings'` → `'SensorReadings'` | camelCase + capitalized first letter |
| `singularize` | `'categories'` → `'category'`, `'reviews'` → `'review'` | Suffix heuristics (`ies`→`y`, `ses`→`s`, trailing `s` dropped) |

## 3. Edge Cases & Error Handling

- **CSV:** empty input → `[]`; a trailing newline does not create a phantom row;
  a lone `"` inside a quoted cell is treated as literal content at end-of-cell.
- **Ids:** `null`/`undefined` parts stringify to `''` — callers (the shaper) only
  pass primary-key columns, which are non-null by definition; a `|` *inside* a key
  value would be ambiguous (see §6).
- **Naming:** `toCamelCase` is idempotent (`'unitPrice'` stays `'unitPrice'`), which
  matters because plan fields pass through it more than once across stages.
- **`singularize`** is heuristic, not a full inflector: irregulars like `people`
  pass through unchanged — affecting only generated *names*, never data.

## 4. Code Breakdown

1. **One dialect, two consumers.** The ETL writes with `formatCsvRow` and the
   importer reads with `parseCsv`. Because both sides share this module, dialect
   drift (the classic ETL bug) cannot happen; `coerce.test.ts` proves the round trip
   bit-for-bit.
2. **`parseCsv` as a state machine** rather than `split(',')`: embedded JSON array
   cells (`"[{""id"":1}]"`) contain commas, quotes, and braces, so naive splitting
   would corrupt every pattern-shaped file.
3. **`deriveId` is intentionally human-readable.** A hash would also be
   deterministic, but `"7|2026-01-01"` lets an operator trace any MongoDB document
   straight back to its SQL source row during migration review.

## 5. Usage Example

```typescript
import { formatCsvRow, parseCsv } from './utilities/csv.js';
import { deriveId } from './utilities/ids.js';
import { toCamelCase, singularize } from './utilities/naming.js';

const row = formatCsvRow([deriveId([42, 'A']), 'said "hi", twice', null]);
console.log(JSON.stringify(row));
// -> "\"42|A\",\"said \"\"hi\"\", twice\",\n"

console.log(parseCsv(row));
// -> [ [ '42|A', 'said "hi", twice', '' ] ]

console.log(toCamelCase('created_at'), singularize('addresses'));
// -> createdAt address
```

## 6. Refactoring / Optimization Suggestions

- `deriveId` does not escape `ID_PART_SEPARATOR` within key parts; if a source ever
  has string PKs containing `|`, add escaping (or switch to a length-prefixed join).
- `parseCsv` builds the whole result in memory; a generator-based `parseCsvLines`
  would let the importer stream multi-GB files (see [07-import-cli.md](07-import-cli.md)).
