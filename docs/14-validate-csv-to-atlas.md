# 14 — Validate csvToAtlas integration

Sources: [`src/utilities/csvToAtlas.ts`](../src/utilities/csvToAtlas.ts),
[`scripts/validate-csv-to-atlas.mjs`](../scripts/validate-csv-to-atlas.mjs),
[`scripts/import-cli.mjs`](../scripts/import-cli.mjs)

## 1. High-Level Summary

hvyMETL's ETL stage produces partitioned CSV chunks shaped for
[csvToAtlas](https://github.com/7erry/cvsToAtlas) import. By default the bundled
`src/import/` CLI is used; set **`CSV_TO_ATLAS_PATH`** in `.env` to delegate imports
and manifest commands to a local clone of the standalone tool.

## 2. Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `CSV_TO_ATLAS_PATH` | no | Absolute path to a [cvsToAtlas](https://github.com/7erry/cvsToAtlas) clone root (`package.json` + `dist/cli.js`) |
| `MONGODB_URI` | for imports | Atlas connection string (shared with csvToAtlas) |
| `MONGODB_DB` | no | Target database (default `csv_to_atlas`; overridden by `--db` on import-cli) |

### Setup external csvToAtlas

```bash
git clone https://github.com/7erry/cvsToAtlas.git ~/projects/cvsToAtlas
cd ~/projects/cvsToAtlas && npm install && npm run build
```

Add to hvyMETL `.env`:

```bash
CSV_TO_ATLAS_PATH=/Users/you/projects/cvsToAtlas
```

## 3. How ETL uses csvToAtlas

1. **`npm run hvymetl -- etl`** validates the resolved csvToAtlas installation before extraction.
2. **`etl-manifest.json`** includes a `csvToAtlas` block (mode, path, repository) and per-collection `importCommand` strings that invoke the correct CLI.
3. **`npm run import-cli`** routes to the external clone when `CSV_TO_ATLAS_PATH` is set; `--db` is translated to `MONGODB_DB` for the external tool.

## 4. Validation

```bash
npm run validate-csv-to-atlas
```

Checks:

- Resolved installation exists (bundled `dist/import/cli.js` or external `dist/cli.js`)
- `package.json` present in external clone
- Analyze smoke test on a temporary CSV (`--analyze`, no `MONGODB_URI` required)

Expected output (bundled):

```text
csvToAtlas repository: https://github.com/7erry/cvsToAtlas
CSV_TO_ATLAS_PATH: (unset — using bundled src/import/)
Resolved: bundled (src/import/)
PASS: csvToAtlas analyze OK (2 rows parsed).
```

## 5. Usage Example

```bash
# ETL writes manifest with csvToAtlas-aware import commands
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot

# Import (uses external clone when CSV_TO_ATLAS_PATH is set)
npm run import-cli -- out/iot/csv/sensorReadings.chunk*.csv sensorReadings --db hvymetl_iot
```
