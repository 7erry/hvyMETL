# 04 — SQL Source Adapters

Sources: [`src/adapters/types.ts`](../src/adapters/types.ts),
[`src/adapters/sqlite.ts`](../src/adapters/sqlite.ts)

## 1. High-Level Summary

The adapter layer is the toolkit's only contact with a SQL database driver. Every
other stage (design engine, ETL, prompt builder) talks to the five-function
`SqlSourceAdapter` interface, so supporting Postgres or MySQL later means
implementing one new file — no changes elsewhere. The shipped implementation wraps
`better-sqlite3` (embedded, zero infrastructure) and powers the seven bundled example
databases.

## 2. Technical Details & Signature

### The `SqlSourceAdapter` contract

| Member | Signature | Description |
| --- | --- | --- |
| `kind` | `string` | Engine identifier, e.g. `"sqlite"` |
| `source` | `string` | Path or connection string |
| `introspect` | `() => SqlStructuralModel` | Tables, columns, PKs, FKs, row counts, relationship cardinality |
| `dumpDdl` | `() => string` | `CREATE TABLE` / `CREATE INDEX` script for prompt grounding |
| `getKeyRange` | `(table, column) => KeyRange \| null` | Min/max of a numeric key, for range splitting |
| `iterate` | `(sql, params?) => IterableIterator<Record<string, unknown>>` | Lazy row cursor — the O(1)-RAM primitive |
| `close` | `() => void` | Release the database handle |

### `createSqliteAdapter(databasePath: string): SqlSourceAdapter`

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `databasePath` | `string` | required | — | Path to an existing SQLite file; opened **read-only** with `fileMustExist: true` |

**Returns:** a `SqlSourceAdapter`. Throws immediately if the file does not exist.

### `sqlTypeToBsonType(sqlType: string): string`

Maps raw SQLite column types to the closest BSON type for `$jsonSchema` validators:

| SQL type matches | BSON type |
| --- | --- |
| `/INT/` | `long` |
| `/(REAL\|FLOA\|DOUB\|NUMERIC\|DECIMAL)/` | `double` |
| `/BOOL/` | `bool` |
| `/(DATE\|TIME)/` | `date` |
| `/BLOB/` | `binData` |
| anything else | `string` |

### Dependencies

| Dependency | Kind | Used for |
| --- | --- | --- |
| `better-sqlite3` | external (native) | Synchronous, cursor-based SQLite access |
| `src/types.ts` | internal | `SqlStructuralModel`, `TableModel`, `RelationshipModel` |

## 3. Edge Cases & Error Handling

- **Read-only by construction:** the adapter can never mutate a source database; the
  ETL's "extraction is side-effect-free" guarantee rests on this flag.
- **Empty tables:** `getKeyRange` returns `null` when `MIN`/`MAX` are `NULL`; the ETL
  responds by producing zero chunks for that collection instead of a degenerate range.
- **Composite primary keys:** PRAGMA's `pk` field is the 1-based ordinal within the
  key; introspection sorts by it so `primaryKey` reflects declared column order —
  which in turn fixes the deterministic `_id` part order.
- **Boundedness threshold:** a relationship is `isBounded` only when the *maximum*
  (not average) children per parent is ≤ 100 (`BOUNDED_CHILDREN_THRESHOLD`). Using
  the max is deliberately conservative: one mega-parent is enough to make embedding
  unsafe (see the Outlier discussion in
  [Building with Patterns](https://www.mongodb.com/company/blog/building-with-patterns-a-summary)).
- **Zero-row relationships** report `maxCount = 0` and are *not* bounded — there is
  no evidence to justify embedding.

## 4. Code Breakdown

1. **`listTableNames()`** queries `sqlite_master`, excluding `sqlite_%` internals, in
   stable alphabetical order (determinism end to end).
2. **`introspectTable()`** combines three PRAGMA calls — `table_info` (columns,
   nullability, pk ordinals), `foreign_key_list` (FK edges), and a `COUNT(*)` — into
   one `TableModel`.
3. **`measureRelationship()`** is the statistical heart: a
   `SELECT AVG(c), MAX(c) FROM (SELECT COUNT(*) c ... GROUP BY fk)` per FK edge
   yields the avg/max children per parent that drive every embed/reference/subset
   decision downstream.
4. **`iterate()`** wraps `better-sqlite3`'s `.iterate()`, which yields rows straight
   from the database cursor — the worker threads stream rows to disk without ever
   materializing a result set.
5. **`dumpDdl()`** reads stored `sql` text from `sqlite_master`, ordered tables-first,
   producing the exact DDL block embedded in the generated prompts.

## 5. Usage Example

```typescript
import { createSqliteAdapter } from './adapters/sqlite.js';

const adapter = createSqliteAdapter('examples/iot.db');
const model = adapter.introspect();

const readings = model.relationships.find(
  (r) => r.childTable === 'sensor_readings' && r.parentTable === 'devices',
);
console.log(readings);
// -> { parentTable: 'devices', childTable: 'sensor_readings', fkColumn: 'device_id',
//      avgChildrenPerParent: ~1000, maxChildrenPerParent: >100, isBounded: false }

console.log(adapter.getKeyRange('sensor_readings', 'id'));
// -> { min: 1, max: 60000 }

adapter.close();
```

## 6. Refactoring / Optimization Suggestions

- `measureRelationship` runs one aggregate query per FK; on a source with hundreds of
  tables, batching these per child table would cut introspection time.
- A `pg` adapter would implement the same contract with `information_schema` +
  `pg_stats`; `iterate` should use a server-side cursor (`pg-cursor`) to preserve the
  O(1)-RAM property.
- Table/identifier names are interpolated into PRAGMA/SELECT strings (quoted); since
  they originate from the database catalog itself this is safe, but a shared
  `assertValidIdentifier` guard would make the invariant explicit.
