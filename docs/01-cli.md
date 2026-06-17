# 01 — The `hvymetl` CLI

Source: [`src/cli.ts`](../src/cli.ts)

## 1. High-Level Summary

`src/cli.ts` is the single entry point that wires every pipeline stage into a
`commander`-based command-line interface with six subcommands (`profiles`, `design`, `explain`,
`prompt`, `etl`, `repogen`). Architecturally it is a thin orchestration shell: it
parses flags, resolves the runtime workload profile (interactively when none is
given), and delegates all real work to the stage modules. CSV imports use the external
[cvsToAtlas](https://github.com/7erry/cvsToAtlas) tool via `npm run import-cli`
([07-import-cli.md](07-import-cli.md); requires `CSV_TO_ATLAS_PATH` in `.env`).

## 2. Technical Details & Signature

### Subcommands

| Command | Purpose | Key flags |
| --- | --- | --- |
| `profiles` | List the eight built-in workload profiles and their tuning | — |
| `design` | Introspect a SQL source and emit `migration-plan.json` + `design-report.md` | `--source <path>` (required), `--out <dir>`, `--explain`, `--csv <dir>`, profile flags |
| `explain` | Explain why patterns/embeds were or were not applied | `--source <path>` or `--ddl-file <path>`, `--plan <path>`, `--csv <dir>`, `--out <dir>`, profile flags |
| `prompt` | Emit the three RAG-grounded production prompts as markdown | `--source <path>` (required), `--out <dir>`, profile flags |
| `etl` | Run the parallel pattern-aware extraction to CSV chunks | `--plan <path>`, `--out <dir>`, `--dry-run`, `--workers <n>` |
| `repogen` | Generate the typed repository layer from a plan | `--plan <path>`, `--out <dir>`, `--lang <id>` |

### Shared profile flags (`design` and `prompt`)

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `--profile <id>` | `string` | optional | interactive menu | One of `catalog`, `cms`, `iot`, `mobile`, `personalization`, `realtime-analytics`, `single-view`, `ledger` |
| `--custom` | `boolean` | optional | `false` | Build a profile from exact telemetry instead of a preset |
| `--read-write <ratio>` | `string` | with `--custom` | `80:20` | Read:write percentages; must sum to 100 |
| `--rpm <number>` | `string` | with `--custom` | `10000` | Peak requests per minute |
| `--growth <rate>` | `string` | with `--custom` | `10GB/month` | Human-readable data growth rate |
| `--critical` | `boolean` | optional | `false` | Lost writes unacceptable: selects `w: "majority"` + journal |

### `resolveProfile(flags: ProfileFlags): Promise<WorkloadProfile>`

The one non-trivial function in this file. Resolution order:

1. `--custom` → validate the ratio and call `buildCustomProfile(...)`.
2. `--profile <id>` → `getProfile(id)` (throws with the valid id list on a typo).
3. Neither → render an interactive `@inquirer/prompts` select menu of all presets.

**Returns:** a fully-populated `WorkloadProfile` (telemetry, preferred patterns, write
concern, pool settings). See [02-profiles.md](02-profiles.md).

### Dependencies

| Dependency | Kind | Used for |
| --- | --- | --- |
| `commander` | external | Subcommand and flag parsing |
| `@inquirer/prompts` | external | Interactive profile selection |
| `dotenv/config` | external | Loads `.env` before any stage runs |
| `src/profiles`, `src/design`, `src/etl`, `src/repogen`, `src/rag`, `src/adapters` | internal | The actual pipeline stages |
| `MONGODB_MODEL_KEY` (env) | optional | Enables hybrid BM25 + Voyage 4 + RRF retrieval |
| `OPENAI_API_KEY` (env) | optional | Vector-only RAG when Model Key is unset |

## 3. Edge Cases & Error Handling

- **Invalid custom ratio:** `--read-write 80:30` throws
  `--read-write must look like "80:20" and sum to 100.` before any work starts.
- **Unknown profile id:** `getProfile` throws a message listing the valid ids, so a
  typo never silently falls back to a default.
- **Top-level rejection:** `program.parseAsync(...).catch(...)` prints the error and
  exits with code 1 — no stack-trace spam for operator-facing failures.
- **Non-TTY environments:** if neither `--profile` nor `--custom` is provided in a
  non-interactive shell (CI), the inquirer prompt will fail; always pass `--profile`
  in automation.

## 4. Code Breakdown

1. **Path anchoring.** `ROOT_DIR` is derived from `import.meta.url`, so `knowledge/`
   and `out/` resolve correctly no matter which directory the CLI is invoked from
   (the file compiles to `dist/cli.js`, hence the `..` hop).
2. **`withProfileFlags(command)`** attaches the six shared profile flags to both
   `design` and `prompt`, keeping flag definitions in exactly one place.
3. **`design` action** resolves the profile and delegates to `runDesign(...)`, which
   owns introspection, retrieval, planning, and artifact writing.
4. **`prompt` action** is the only command that composes stages inline: it dumps DDL
   via the adapter, loads + retrieves knowledge chunks, then writes the three prompt
   files from `buildPromptBundle(...)`. This stays inline because no other stage needs
   that exact composition.
5. **`etl` / `repogen` actions** are pure pass-throughs into `runEtl` / `runRepogen`,
   converting string flags into typed options.

## 5. Usage Example

```bash
# Interactive profile selection (omit --profile to get the menu):
npm run hvymetl -- design --source examples/catalog/catalog.db --out out/catalog

# Fully scripted with a custom write-heavy profile:
npm run hvymetl -- design --source examples/analytics/analytics.db \
  --custom --read-write 20:80 --rpm 250000 --growth 1TB/week --out out/custom
```

Expected output (preset run, no Model Key):

```text
Introspected 7 tables, 7 relationships.
Retrieval strategy: lexical BM25 (no API key configured).
Planned 5 collections.
Wrote out/catalog/migration-plan.json
Wrote out/catalog/design-report.md
```

With `MONGODB_MODEL_KEY` in `.env`:

```text
Retrieval strategy: hybrid BM25 + voyage-4 (Reciprocal Rank Fusion).
```

Validate hybrid retrieval before a design run:

```bash
npm run validate-hybrid-rag
```

## 6. Refactoring / Optimization Suggestions

- The `prompt` action composes adapter + retriever inline; extracting a
  `runPrompt(options)` into `src/rag/` would make the CLI file purely declarative.
- `--workers` accepts any string and is clamped later; validating it as a positive
  integer at parse time would fail faster with a clearer message.
