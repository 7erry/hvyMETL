# 02 — Workload Profiles

Source: [`src/profiles/profiles.ts`](../src/profiles/profiles.ts)

## 1. High-Level Summary

This module encodes the toolkit's core premise — *MongoDB schemas are optimized
around how data is accessed, not how it looks* — as data. Each of the eight preset
profiles bundles one realistic access pattern (read:write ratio, peak RPM, growth
rate) with the MongoDB tuning that workload needs: preferred design patterns, write
concern, and driver pool sizing. Architecturally it is a pure configuration module
(no I/O) consumed by the design engine, the prompt builder, and the repository
generator.

## 2. Technical Details & Signature

### Exports

| Export | Type | Description |
| --- | --- | --- |
| `WORKLOAD_PROFILES` | `Record<id, WorkloadProfile>` | The eight presets, keyed by id |
| `ALL_PROFILES` | `WorkloadProfile[]` | Array form for menus and listings |
| `getProfile(id)` | `(id: string) => WorkloadProfile` | Lookup with a helpful throw |
| `buildCustomProfile(telemetry, isCritical)` | `(WorkloadTelemetry, boolean) => WorkloadProfile` | Derive tuning for user-supplied numbers |

### The preset matrix

| Id | Label | R:W | Peak RPM | Growth | Write concern | Pool (min–max) |
| --- | --- | --- | --- | --- | --- | --- |
| `catalog` | E-commerce Catalog | 95:5 | 60,000 | 5GB/month | `w:1` | 20–200 |
| `cms` | Content Management | 90:10 | 30,000 | 2GB/month | `w:1` | 15–150 |
| `iot` | IoT Telemetry | 10:90 | 600,000 | 1TB/week | `w:1` | 50–300 |
| `mobile` | Mobile Backend | 80:20 | 120,000 | 50GB/month | `w:1` | 25–250 |
| `personalization` | Personalization Engine | 70:30 | 90,000 | 20GB/month | `w:1` | 20–200 |
| `realtime-analytics` | Real-Time Analytics | 30:70 | 300,000 | 500GB/month | `w:1` | 40–300 |
| `single-view` | Single View (Customer 360) | 85:15 | 45,000 | 10GB/month | `w:1` | 15–150 |
| `ledger` | Financial Ledger | 50:50 | 20,000 | 15GB/month | `w:"majority"` + journal | 10–100 |

Each profile also carries `preferredPatterns: PatternId[]` in priority order (for
example `iot` prefers `bucket, computed, preallocation, reference`), which feeds both
the RAG retrieval query and the design engine's bucket gating. The pattern semantics
follow MongoDB's
[Building with Patterns: A Summary](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).

### `buildCustomProfile(telemetry, isCritical)` parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `telemetry.readPercent` | `number` | required | — | Percentage of operations that are reads (0–100) |
| `telemetry.writePercent` | `number` | required | — | Percentage of operations that are writes (0–100) |
| `telemetry.peakRpm` | `number` | required | — | Peak requests per minute |
| `telemetry.growthRate` | `string` | required | — | Human-readable, e.g. `"1TB/week"` |
| `isCritical` | `boolean` | required | — | `true` selects `w: "majority"` + journal |

**Returns:** a `WorkloadProfile` with `id: 'custom'`. Pattern preferences and pool
sizing are derived with the same heuristics the presets follow: `writePercent >= 60`
selects the write-optimized pattern set; `peakRpm >= 100000` selects the large pool.

### Dependencies

Internal only: type definitions from `src/types.ts`. No I/O, no environment variables.

## 3. Edge Cases & Error Handling

- `getProfile('iott')` throws
  `Unknown profile "iott". Valid profiles: catalog, cms, ..., or use --custom.`
- `buildCustomProfile` does **not** re-validate that percentages sum to 100 — the CLI
  validates that before calling (see [01-cli.md](01-cli.md)). Calling it directly with
  inconsistent numbers produces a profile that faithfully reflects those numbers.
- Write-concern rationale: presets default to `w: 1` (acknowledge after the primary)
  because high-velocity telemetry tolerates rare rollbacks; only `ledger` (and
  `--critical` customs) pays the `w: "majority"` + journal latency for zero-loss
  durability.

## 4. Code Breakdown

1. **Presets as a typed record.** `Record<Exclude<WorkloadProfileId, 'custom'>, WorkloadProfile>`
   means adding a new id to the union without a preset is a compile error — the type
   system keeps the menu, the lookup, and the docs in sync.
2. **Pool sizing logic.** Read-heavy workloads get large `maxPoolSize` (many cheap
   concurrent readers); write-heavy workloads get longer `socketTimeoutMS` (bulk
   writes hold sockets longer); bursty mobile traffic gets a short `maxIdleTimeMS`
   so idle sockets are reclaimed between spikes.
3. **`buildCustomProfile` mirrors the presets** rather than inventing a third tuning
   scheme: two booleans (`isWriteHeavy`, `isHighRpm`) select among the same values
   the presets use, so custom workloads land on tested configurations.

## 5. Usage Example

```typescript
import { getProfile, buildCustomProfile } from './profiles/profiles.js';

const iot = getProfile('iot');
console.log(iot.preferredPatterns);
// -> [ 'bucket', 'computed', 'preallocation', 'reference' ]

const custom = buildCustomProfile(
  { readPercent: 20, writePercent: 80, peakRpm: 250000, growthRate: '1TB/week' },
  false,
);
console.log(custom.pool.maxPoolSize, custom.writeConcern);
// -> 300 { w: 1, journal: false }
```

## 6. Refactoring / Optimization Suggestions

- Peak-RPM numbers are illustrative defaults; loading overrides from a
  `profiles.local.json` would let teams encode measured production telemetry without
  editing source.
