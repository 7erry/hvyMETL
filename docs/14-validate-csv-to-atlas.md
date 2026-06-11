# 14 — Validate csvToAtlas integration

Sources: [`src/utilities/csvToAtlas.ts`](../src/utilities/csvToAtlas.ts),
[`scripts/validate-csv-to-atlas.mjs`](../scripts/validate-csv-to-atlas.mjs),
[`scripts/import-cli.mjs`](../scripts/import-cli.mjs)

## 1. High-Level Summary

hvyMETL's ETL stage produces partitioned CSV chunks for import by
**[cvsToAtlas](https://github.com/7erry/cvsToAtlas)**. You must clone that repository
and set **`CSV_TO_ATLAS_PATH`** in `.env` — there is no bundled import CLI in hvyMETL.

## 2. Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `CSV_TO_ATLAS_PATH` | **yes** | Absolute path to cvsToAtlas clone root (`package.json` + `dist/cli.js`) |
| `MONGODB_URI` | for imports | Atlas connection string (shared with csvToAtlas) |
| `MONGODB_DB` | no | Target database (default `csv_to_atlas`; overridden by `--db` on import-cli) |

### Setup

```bash
git clone https://github.com/7erry/cvsToAtlas.git ~/projects/cvsToAtlas
cd ~/projects/cvsToAtlas && npm install && npm run build
```

Add to hvyMETL `.env`:

```bash
CSV_TO_ATLAS_PATH=/Users/you/projects/cvsToAtlas
```

## 3. How ETL uses csvToAtlas

1. **`npm run hvymetl -- etl`** validates `CSV_TO_ATLAS_PATH` before extraction.
2. **`etl-manifest.json`** includes a `csvToAtlas` block and per-collection `importCommand` strings.
3. **`npm run import-cli`** invokes the external clone; `--db` is translated to `MONGODB_DB`.

## 4. Validation

```bash
npm run validate-csv-to-atlas
```

Checks:

- `CSV_TO_ATLAS_PATH` is set and the directory exists
- `package.json` and `dist/cli.js` (or `src/cli.ts`) are present
- Analyze smoke test on a temporary CSV (`--analyze`, no `MONGODB_URI` required)

Expected output:

```text
csvToAtlas repository: https://github.com/7erry/cvsToAtlas
CSV_TO_ATLAS_PATH: /Users/you/projects/cvsToAtlas
Resolved: csv-to-atlas @ /Users/you/projects/cvsToAtlas
PASS: csvToAtlas analyze OK (2 rows parsed).
```

## 5. Usage Example

```bash
npm run validate-csv-to-atlas
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot
npm run import-cli -- out/iot/csv/sensorReadings.chunk*.csv sensorReadings --db hvymetl_iot
```
