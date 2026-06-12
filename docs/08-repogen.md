# 08 — The Repository Layer Generator

Sources: [`src/repogen/generate.ts`](../src/repogen/generate.ts),
[`src/repogen/languages/`](../src/repogen/languages/)

## 1. High-Level Summary

`repogen` is the final stage: it reads `migration-plan.json` and emits a complete,
strictly-typed data access layer in any of the **13 client languages MongoDB
officially supports** — a shared profile-tuned connection module, an index bootstrap
script, and one repository per collection whose write methods use only **atomic
MongoDB modifiers** (`$inc`, `$push` with `$slice`/`$each`/`$position`, `$setOnInsert`,
`$set`). Application-side read-modify-write loops are structurally impossible because
no generated method ever reads a document in order to write it back.

Generated code follows SOLID principles, strict typing where the language allows,
explicit error handling, and idiomatic patterns for each driver. Connection URIs and
database names are always passed in by the caller — no hardcoded secrets.

## 2. Supported languages

| `--lang` id | Language | MongoDB driver |
| --- | --- | --- |
| `node` | Node.js (TypeScript) | `mongodb` |
| `python` | Python | `pymongo` |
| `go` | Go | `mongo-go-driver` |
| `java` | Java | `mongodb-driver-sync` |
| `kotlin` | Kotlin | `mongodb-driver-sync` |
| `csharp` | C# | `MongoDB.Driver` |
| `ruby` | Ruby | `mongo` gem |
| `php` | PHP | `mongodb/mongodb` |
| `rust` | Rust | `mongodb` crate |
| `scala` | Scala | `mongodb-scala` |
| `swift` | Swift | `MongoSwift` |
| `c` | C | `libmongoc` |
| `cpp` | C++ | `mongocxx` |

Default: `node` (TypeScript). Language modules live under
[`src/repogen/languages/`](../src/repogen/languages/); each implements the same
repository surface (CRUD + pattern maintainers) using that driver's idioms.

### Generated files (by language)

File naming follows each ecosystem's conventions. Every target emits the same logical
modules:

| Module | Node.js example | Python example | Java example |
| --- | --- | --- | --- |
| Connection | `mongoClient.ts` | `mongo_client.py` | `MongoClientFactory.java` |
| Indexes | `ensureIndexes.ts` | `ensure_indexes.py` | `EnsureIndexes.java` |
| Repositories | `productsRepository.ts` | `products_repository.py` | `ProductsRepository.java` |

C and C++ emit paired `.h`/`.c` or `.hpp`/`.cpp` files.

## 3. Technical Details & Signature

### `runRepogen(options: RepogenOptions): RepogenGenerateResult`

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `options.planPath` | `string` | required | — | Path to `migration-plan.json` |
| `options.outDir` | `string` | required | — | Destination folder for generated files |
| `options.language` | `string` | optional | `node` | One of the 13 `--lang` ids above |

**Returns:** `RepogenGenerateResult` with `files[]`, `language`, `languageLabel`,
`driverName`, and `collectionCount`. When `outDir` is set, writes files and logs each path.

### `generateFromPlan(options): RepogenGenerateResult`

Same as above but accepts an in-memory `MigrationPlan` (used by the web API).

### Per-repository surface (varies with the collection's patterns)

| Generated function | Present when | Atomic mechanism |
| --- | --- | --- |
| `find<Doc>ById(id)` / `list<Docs>(…)` | always | point read / paged read |
| `insert<Doc>(doc)` / `update<Doc>Fields(id, fields)` | always | `insertOne` / single `$set` |
| `increment<Field>(id, delta)` | Computed counters | `$inc` (never read-add-write) |
| `pushTo<Field>(id, item)` | Subset arrays | `$push: { $each, $position: 0, $slice: n }` |
| `record<Collection>Measurement(…)` | Bucket collections | upsert by deterministic window `_id` |
| `fanOut<Field>Update(refId, fields)` | Extended References | `updateMany` on duplicated lookup fields |

### Type generation

Each repository exports a typed document shape derived from the plan's
`$jsonSchema.properties` (field names map to language-native types: `long`→number/int,
`date`→Date/Instant/time, `array`→list/array, …). In TypeScript, Rust, and Java this
enables compile-time verification of `$push`/`$inc` field compatibility.

### Dependencies

**Generator:** `node:fs`, internal plan spec + language modules. **Generated code:**
only the target MongoDB driver — zero runtime dependency on hvyMETL.

## 4. Edge Cases & Error Handling

- **One client per process:** connection modules lazily create a single client and reuse
  it; the driver pools connections internally. A `close`/`disconnect` helper exists for
  graceful shutdown.
- **Subset arrays can never grow unbounded:** the `$slice` cap is part of the same
  atomic `$push`.
- **Bucket upserts are race-free by key design:** two writers recording into the same
  device-hour both target the same deterministic `_id`.
- **Fan-out is eventually consistent by design** — the Extended Reference trade-off
  documented in MongoDB's Building with Patterns series.

## 5. Usage Examples

### CLI — TypeScript (default)

```bash
npm run hvymetl -- repogen --plan out/catalog/migration-plan.json --out out/catalog/repositories
```

### CLI — other languages

```bash
npm run hvymetl -- repogen --plan out/iot/migration-plan.json --out out/iot/repositories --lang python
npm run hvymetl -- repogen --plan out/iot/migration-plan.json --out out/iot/repositories --lang java
npm run hvymetl -- repogen --plan out/iot/migration-plan.json --out out/iot/repositories --lang go
```

### Web UI

After **AI Migration Export**, use the **Repository language** dropdown and click
**Generate repositories**. Generated files appear as tabs; **Download repositories**
saves all files. See [13-web-ui.md](13-web-ui.md).

### API

```bash
curl http://localhost:3847/api/repogen/languages
curl -X POST http://localhost:3847/api/repogen/generate \
  -H 'content-type: application/json' \
  -d '{"planJson":"…","language":"kotlin"}'
```

### Consuming generated TypeScript

```typescript
import { getDb } from './out/catalog/repositories/mongoClient.js';
import { pushToRecentReviews, incrementTotalReviews, findProductsById }
  from './out/catalog/repositories/productsRepository.js';

const db = await getDb(process.env.MONGODB_URI ?? '', 'catalog');

await pushToRecentReviews(db, '42', { id: 9001, rating: 5, title: 'Great' });
await incrementTotalReviews(db, '42', 1);

const product = await findProductsById(db, '42');
```

## 6. Refactoring / Optimization Suggestions

- `pushToSubset` + `incrementCounter` are two round trips; collections that always
  pair them could get a combined single-`updateOne` helper.
- A generated smoke test suite per repository (against an in-memory MongoDB) would let
  teams verify the layer before pointing it at Atlas.
