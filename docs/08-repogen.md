# 08 — The Repository Layer Generator

Source: [`src/repogen/generate.ts`](../src/repogen/generate.ts)

## 1. High-Level Summary

`repogen` is the final stage: it reads `migration-plan.json` and emits a complete,
strictly-typed TypeScript data access layer — a shared profile-tuned `MongoClient`
module, an index bootstrap script, and one repository per collection whose write
methods use only **atomic MongoDB modifiers** (`$inc`, `$push` with `$slice`/`$each`/
`$position`, `$setOnInsert`, `$set`). Application-side read-modify-write loops are
structurally impossible because no generated method ever reads a document in order
to write it back.

## 2. Technical Details & Signature

### `runRepogen(options: RepogenOptions): void`

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `options.planPath` | `string` | required | Path to `migration-plan.json` |
| `options.outDir` | `string` | required | Destination folder for generated `.ts` files |

**Returns:** `void` (synchronous file generation); writes files and logs each path.

### Generated files

| File | Contents |
| --- | --- |
| `mongoClient.ts` | Singleton `getDb(uri, dbName)` / `closeDb()` with the profile's pool + write concern baked in as constants |
| `ensureIndexes.ts` | One `createIndex` per planned index spec, runnable as a script |
| `<collection>Repository.ts` | Typed document type + CRUD + pattern-maintainer functions |

### Per-repository surface (varies with the collection's patterns)

| Generated function | Present when | Atomic mechanism |
| --- | --- | --- |
| `find<Doc>ById(id)` / `list<Docs>(filter, limit)` | always | point read / paged read |
| `insert<Doc>(doc)` / `update<Doc>Fields(id, fields)` | always | `insertOne` / single `$set` |
| `increment<Field>(id, delta)` | Computed counters | `$inc` (never read-add-write) |
| `pushTo<Field>(id, item)` | Subset arrays | `$push: { $each, $position: 0, $slice: n }` — newest-first, hard-capped in one server-side operation |
| `record<Collection>Measurement(...)` | Bucket collections | upsert by deterministic `(source, window)` `_id`: `$setOnInsert` window metadata + `$push` measurement + `$inc count` |
| `fanOut<Field>Update(refId, fields)` | Extended References | `updateMany` re-stamping duplicated lookup fields on all referrers |

### Type generation

Each repository exports `type <Pascal>Document` derived from the plan's
`$jsonSchema.properties` via `bsonTypeToTs` (`long`→`number`, `date`→`Date | string`,
`array`→`<Item>[]`, …). Because the type is precise — no loose `& Document`
intersection — the driver's generics verify `$push`/`$inc` field compatibility at
compile time. Verified: generated output compiles clean under `tsc --strict`.

### Dependencies

Generator: `node:fs`, internal naming utilities. **Generated code:** only the
`mongodb` driver — the connection URI and database name are passed in by the caller,
so the generated layer has zero hidden environment dependencies.

## 3. Edge Cases & Error Handling

- **One client per process:** `getDb` lazily creates a single `MongoClient` and
  reuses it; the driver pools connections internally, so repeated calls never leak
  sockets. `closeDb()` exists for graceful shutdown.
- **Subset arrays can never grow unbounded:** the `$slice` cap is part of the same
  atomic `$push` — there is no window where the array exceeds its limit.
- **Bucket upserts are race-free by key design:** two writers recording into the same
  device-hour both target the same deterministic `_id`; `$setOnInsert` ensures one
  creates the window and both `$push` into it.
- **Fan-out is eventually consistent by design** — the Extended Reference trade-off
  ("data duplication") called out in
  [Building with Patterns: A Summary](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).
  Readers may briefly see stale duplicated fields while `updateMany` runs; the
  source-of-truth lookup collection is updated first.
- **`fanOut` filter typing** is inferred from the schema, so a numeric `brandId`
  reference generates a `number`-typed parameter — string/number id mismatches are
  caught at compile time.

## 4. Code Breakdown

1. **Client module first.** `renderClientModule` snapshots the profile's
   `maxPoolSize`, `minPoolSize`, `socketTimeoutMS`, `maxIdleTimeMS`, write concern,
   and journal flag into literal constants — the generated code carries its tuning
   with it and has no dependency on hvyMETL at runtime.
2. **Type from schema.** `renderRepositoryModule` walks `jsonSchema.properties`,
   emitting one field per property with `?` for non-required fields.
3. **Pattern maintainers from plan metadata.** Each `computedFields`,
   `embeddedArrays` (with `subsetLimit`), `bucket`, and `extendedReferences` entry
   produces exactly one purpose-built function; collections without a pattern get
   only the base CRUD.
4. **Comment trail.** Every generated function carries a doc comment naming the
   pattern it maintains and why the modifier shape is safe under concurrency, so the
   generated code is reviewable on its own.

## 5. Usage Example

```bash
npm run hvymetl -- repogen --plan out/catalog/migration-plan.json --out out/catalog/repositories
# Wrote out/catalog/repositories/mongoClient.ts
# Wrote out/catalog/repositories/ensureIndexes.ts
# Wrote out/catalog/repositories/productsRepository.ts
# ...
```

Consuming the generated layer:

```typescript
import { getDb } from './out/catalog/repositories/mongoClient.js';
import { pushToRecentReviews, incrementTotalReviews, findProductsById }
  from './out/catalog/repositories/productsRepository.js';

const db = await getDb(process.env.MONGODB_URI ?? '', 'catalog');

// One atomic operation: prepend the review AND cap the array at 10.
await pushToRecentReviews(db, '42', { id: 9001, rating: 5, title: 'Great' });
await incrementTotalReviews(db, '42', 1);

const product = await findProductsById(db, '42');
console.log(product?.totalReviews, product?.recentReviews?.length);
// -> 318 10   (counter grew; subset stayed capped)
```

## 6. Refactoring / Optimization Suggestions

- `pushToSubset` + `incrementCounter` are two round trips; collections that always
  pair them could get a combined single-`updateOne` helper (`$push` + `$inc` in one
  document update is still atomic).
- Code is emitted via template strings; adopting `ts-morph` would enable
  syntax-verified generation if the templates grow further.
- A generated `*.test.ts` smoke suite per repository (against
  `mongodb-memory-server`) would let teams verify the layer before pointing it at
  Atlas.
