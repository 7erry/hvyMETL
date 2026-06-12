# 10 — Example Domains & Seeder

Sources: [`examples/`](../examples/) (one folder per domain), [`src/examples/seed.ts`](../src/examples/seed.ts)

## 1. High-Level Summary

Seven self-contained SQLite databases give the toolkit realistic, end-to-end-testable
inputs without any external infrastructure. Each domain matches one workload profile
and was deliberately shaped to *trigger specific design patterns* — skewed review
counts for Subset + Outlier, a 60,000-row sensor firehose for Bucket, an EAV table
for Attribute — so a run over any example demonstrates and regression-tests the
corresponding decision rules from the
[Building with Patterns series](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).

## 2. Technical Details & Signature

### The domain matrix

| Database | Profile | Tables | Patterns it is designed to trigger |
| --- | --- | --- | --- |
| `catalog.db` | `catalog` | brands, categories (self-referencing), products, product_variants, product_attributes (EAV), reviews (skewed), inventory_levels | Attribute, Subset + Outlier, Extended Reference, Computed, Tree |
| `cms.db` | `cms` | authors, pages (self-referencing), content_blocks (`block_type` + sparse variants), assets, page_revisions, tags, page_tags (junction) | Polymorphic, Tree, junction folding, Schema Versioning |
| `iot.db` | `iot` | sites, firmware_versions, devices, sensors, sensor_readings (60k rows), device_alerts | **Bucket**, Computed, Reference, Extended Reference |
| `mobile.db` | `mobile` | app_users, user_devices, sessions, app_events (firehose), purchases, push_notifications | Subset, Bucket, Computed, Extended Reference |
| `personalization.db` | `personalization` | profiles, profile_traits (sparse), items, affinities (two parents), recommendations, segments, profile_segments (junction) | Attribute, multi-parent guard, Subset, Computed |
| `analytics.db` | `realtime-analytics` | tracked_sites, campaigns, page_events (firehose, `event_type`), funnels, funnel_steps, hourly_rollups | Bucket, Pre-allocation, Computed, Reference |
| `singleview.db` | `single-view` | crm_customers, web_accounts, orders, order_items, support_tickets, marketing_touches, loyalty_accounts | Extended Reference fan-in, Subset + Outlier, Computed |

### `seed.ts` entry point

```bash
npm run seed-examples        # builds, then node dist/examples/seed.js
```

No parameters. For each domain it deletes any existing `.db` file, executes the DDL
from `examples/<domain>/<domain>.sql`, and populates it inside one transaction.

Each domain folder also ships a Python CSV generator (`<domain>_generator.py`) that
writes scaled mock CSVs alongside the SQL schema. **CSV files are not checked into
git** (they can be large); generate them locally when you need csvToAtlas pipeline
demos:

```bash
cd examples/iot && python iot_generator.py
cd examples/catalog && python catalog_generator.py
# … same pattern for analytics, cms, mobile, personalization, singleview
```

Run the script from inside the domain folder — it writes one CSV per table next to
the `.sql` schema. Adjust scale constants at the top of each generator before
running if you need smaller or larger datasets.

### The deterministic RNG

| Function | Signature | Description |
| --- | --- | --- |
| `createRng` | `(seed: number) => () => number` | Mulberry32 PRNG — tiny, fast, and fully reproducible |
| `randomInt` | `(rng, min, max) => number` | Inclusive integer draw |
| `pick` | `<T>(rng, items: T[]) => T` | Uniform choice |

Every domain seeds its own RNG with a fixed constant, so **every run of
`seed-examples` produces byte-identical databases** — test assertions about row
counts and skew never flake.

### Dependencies

`better-sqlite3` (write mode — the only place the toolkit writes SQL), `node:fs`.

## 3. Edge Cases & Error Handling

- **Re-runs are clean:** existing `.db` files are removed first; WAL sidecar files
  (`-shm`/`-wal`) are SQLite-managed and harmless.
- **Skew is intentional:** in `catalog`, most products get 0–8 reviews while a few
  "hot" products get 150–400 — placing the data right across the Outlier rule's
  `max/avg ≥ 10` threshold so the test exercises the boundary, not just the obvious
  case.
- **Time-series density:** `sensor_readings` spreads 60,000 rows across devices and
  hours so window-aligned chunk splitting produces real multi-chunk parallelism (and
  the bucket-integrity check — no duplicate `(device, window)` ids across chunks —
  is meaningful).
- **Nullable variant columns** in `cms.content_blocks` (`text_body`,
  `image_asset_id`, `video_duration_sec`, `embed_url` — populated by `block_type`)
  are exactly the shape the Polymorphic detector looks for.

## 4. Code Breakdown

1. **One builder function per domain** (`seedCatalog`, `seedIot`, …) keeps each
   dataset's shaping logic readable in isolation.
2. **Transactional inserts.** Each builder prepares its `INSERT` statements once and
   runs all rows inside `db.transaction(...)` — seeding 60k+ rows takes well under a
   second instead of minutes of per-row fsyncs.
3. **Shaping before volume.** Builders first decide the *distribution* (which
   products are outliers, which devices are chatty), then generate rows to match —
   the inverse of naive uniform seeding, and the reason the examples exercise every
   decision rule.

## 5. Usage Example

```bash
npm run seed-examples
```

Expected output:

```text
Seeded examples/catalog/catalog.db
Seeded examples/cms/cms.db
Seeded examples/iot/iot.db
Seeded examples/mobile/mobile.db
Seeded examples/personalization/personalization.db
Seeded examples/analytics/analytics.db
Seeded examples/singleview/singleview.db
```

Then run any pipeline stage against a domain:

```bash
npm run hvymetl -- design --source examples/cms/cms.db --profile cms --out out/cms
# The design report will include a Polymorphic decision for content_blocks
# (block_type discriminator + sparse text/image/video variant columns).
```

### Run all seven domains into Atlas

To exercise every example end-to-end with automated validation against your Atlas
cluster, see **[11-run-all-examples.md](11-run-all-examples.md)**:

```bash
npm run run-all-examples   # requires MONGODB_URI in .env
```

## 6. Refactoring / Optimization Suggestions

- Row volumes are compile-time constants; a `--scale 10` flag multiplying volumes
  would turn the examples into a load-testing harness for the ETL stage.
- The seeder is the only module that both defines data shapes and writes them;
  extracting the distributions into a small declarative spec would document the
  intended skew explicitly.
