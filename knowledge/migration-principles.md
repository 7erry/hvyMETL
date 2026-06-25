# SQL-to-MongoDB Migration Principles

Cross-cutting rules for migrating normalized SQL schemas into MongoDB document
models. These principles sit above individual design patterns (embed, subset,
extended-reference) and guide when the migration engine should merge, denormalize,
or reshape data instead of mapping tables 1-to-1.

## Rule 1: Break the 1-to-1 Normalization Habit (Embed over Reference)

In SQL, normalization scatters one logical request across many tables (`users`,
`profiles`, `settings`). MongoDB eliminates that busywork.

**Recommendation:** Do not migrate SQL tables 1-to-1 into MongoDB collections.
Look at tables connected by foreign keys that are **always queried together** and
merge them. A user registration should not hit five collections; it should be one
rich document with nested objects for settings, profiles, and metadata.

**Engine signals:**

- Parent/child pairs with a single FK and no independent query path → embed.
- Tables named `*meta`, `*_meta`, or classic EAV shapes → collapse into the
  parent as a nested object or attribute array (see Attribute pattern).
- Avoid creating a separate collection for every normalized SQL table when the
  read path always joins them.

## Rule 2: Re-architect to Eliminate the Need for Transactions

MongoDB supports multi-document ACID transactions, but relying on them heavily is
an architectural red flag.

**Recommendation:** Design document models so operations are **atomic by default**.
A single document can contain nested arrays and objects; writing to that document
is inherently atomic without a multi-collection transaction. Reserve transactions
for true cross-entity logic (e.g., transferring funds between two distinct
accounts).

**Engine signals:**

- Prefer folding dependent rows into the parent document instead of split
  collections that must stay in sync via transactions.
- Flag designs that require updates across many collections for one user action.

## Rule 3: Embrace Intentional Denormalization

SQL developers fear duplicate data because it breaks referential integrity.
MongoDB embraces denormalization to eliminate expensive JOINs on reads.

**Recommendation:** Trade a slight increase in write-time complexity for massive
read performance. When migrating `orders` and `customers`, embed the customer's
name and email into the order document at purchase time — historical orders are a
**snapshot in time** and should not change when the user updates their profile.
For data that must stay live, use MongoDB Change Streams to propagate updates in
the background (Extended Reference pattern).

**Engine signals:**

- Read-heavy workloads + FK to small lookup tables → Extended Reference
  (duplicate hot lookup columns onto the child document).
- Immutable or point-in-time facts (orders, invoices, audit events) → embed
  snapshot fields; do not reference live profile data.

## Rule 4: Keep the Application Layer Lean (Skip Heavy ODMs)

Mapping SQL rows into heavy ORM model instances allocates intermediate objects,
creates garbage-collection pressure, and kills throughput.

**Recommendation:** Avoid heavy ODMs (e.g. Mongoose) that recreate object-relational
impedance mismatch by wrapping BSON in thick abstractions. Prefer the **native
MongoDB driver**. BSON maps natively to JSON/JavaScript objects — read from the
database and pass straight to your API without an expensive translation layer.

**Engine signals:**

- Repository generator output uses the official driver, not an ODM wrapper.
- Migration plans should not assume an intermediate domain-object layer between
  BSON and API responses.

## Rule 5: Shift Computation into the Aggregation Engine

SQL uses CTEs, subqueries, or application post-processing to shape UI results.

**Recommendation:** Use MongoDB **Aggregation Pipelines** to filter, sort, and
shape data inside the database before it hits the application.

- `$addFields` — compute conditional or formatted UI fields on the fly.
- `$out` / `$merge` — write heavy processing results into new collections
  natively, eliminating external ETL scripts for derived data.

**Engine signals:**

- Computed counters on parents (Computed pattern) mirror what aggregations would
  otherwise do on every read.
- Bucket and archive patterns move time-series rollups into database-native shapes.

## Rule 6: Lean Into Zero-Downtime Schema Evolution

Production SQL `ALTER TABLE` scripts can lock tables and cause downtime.

**Recommendation:** Capitalize on MongoDB's flexible schema. New features can write
new fields immediately without migrating every existing document or taking the
system offline. Apply the **Schema Versioning** pattern on every collection so
application code can branch on a version stamp during rollout.

**Engine signals:**

- Every collection in the migration plan receives a schema version field.
- Avoid rigid `$jsonSchema` requirements that block additive field rollout.

## Summary Checklist for the Migration Engine

The engine must not only map datatypes — it must actively hunt for optimization
patterns:

### Identify junction and meta tables

If the schema contains tables like `usermeta`, `postmeta`, or other `*meta` /
EAV tables, **recommend collapsing those rows into a single nested object or
attribute array** inside the parent (`users`, `posts`) document. Do not leave meta
tables as standalone collections when they exist only to extend a parent row.

### Flag strict one-to-many line items

If a parent has a strict dependent child (e.g. `orders` → `order_items`), **default
to embedding child rows as an array inside the parent document** rather than a
separate collection — unless cardinality is unbounded, write-heavy RPM dominates,
or the child is queried independently at scale.

### Anti-patterns to reject

- 1-to-1 table-to-collection mapping when FK-linked tables are always read together.
- Multi-collection updates for a single user-facing operation when one document
  could hold the data atomically.
- Live mutable references on immutable historical records (orders, invoices).

## Applicability rules

- Apply Rules 1–3 during **design** (pattern selection and migration plan).
- Apply Rules 4–6 during **repository generation**, **ETL shaping**, and **operational
  guidance** in the design report.
- Read-heavy profiles (≥ 70% reads) weight embed and denormalization more
  aggressively; write-heavy profiles (≥ 60% writes) keep unbounded children as
  references or buckets.
