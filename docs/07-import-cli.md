# 07 — The csvToAtlas Import CLI

Sources: [cvsToAtlas](https://github.com/7erry/cvsToAtlas),
[`scripts/import-cli.mjs`](../scripts/import-cli.mjs),
[`src/utilities/csvToAtlas.ts`](../src/utilities/csvToAtlas.ts)

## 1. High-Level Summary

hvyMETL does **not** ship an import implementation. All CSV → Atlas loads go through the
standalone **[cvsToAtlas](https://github.com/7erry/cvsToAtlas)** tool, configured via
**`CSV_TO_ATLAS_PATH`** in `.env`. The `npm run import-cli` script is a thin wrapper
that invokes the external CLI and translates hvyMETL's `--db` flag into `MONGODB_DB`.

The ETL stage produces partitioned CSV chunks with deterministic `_id` values shaped for
csvToAtlas's modeling rules (dotted headers, `[]` arrays, JSON cells). Parallel chunk
imports upsert safely on `_id`.

## 2. Setup

```bash
git clone https://github.com/7erry/cvsToAtlas.git ~/projects/cvsToAtlas
cd ~/projects/cvsToAtlas && npm install && npm run build
```

In hvyMETL `.env`:

```bash
CSV_TO_ATLAS_PATH=/Users/you/projects/cvsToAtlas
MONGODB_URI=mongodb+srv://...
```

Validate:

```bash
npm run validate-csv-to-atlas
```

See [14-validate-csv-to-atlas.md](14-validate-csv-to-atlas.md) for full details.

## 3. Command contract

```bash
npm run import-cli -- <file.csv...> [collection] [flags]
```

hvyMETL forwards all arguments to csvToAtlas. Common flags (see the
[cvsToAtlas README](https://github.com/7erry/cvsToAtlas)):

| Flag | Description |
| --- | --- |
| `--analyze` | Analysis-only; no `MONGODB_URI` required |
| `--join <field>` | Join field for related CSVs |
| `--parent <file.csv>` | Parent file for embed mode |
| `--embed <file:field>` | Embed child CSV as array (repeatable) |
| `--drop` | Drop collection before import |
| `--db <name>` | **hvyMETL wrapper only** — sets `MONGODB_DB` for csvToAtlas |

| Environment variable | Required | Description |
| --- | --- | --- |
| `CSV_TO_ATLAS_PATH` | **yes** | Path to cvsToAtlas clone root |
| `MONGODB_URI` | for imports | Atlas connection string |
| `MONGODB_DB` | optional | Default database (default `csv_to_atlas`) |

## 4. ETL integration

After `npm run hvymetl -- etl`, `etl-manifest.json` lists per-collection
`importCommand` strings and a `csvToAtlas` metadata block pointing at your clone.

```bash
npm run hvymetl -- etl --plan out/iot/migration-plan.json --out out/iot
npm run import-cli -- out/iot/csv/sensorReadings.chunk*.csv sensorReadings --db hvymetl_iot
```

## 5. Usage examples

```bash
# Analyze partitioned ETL chunks (no Atlas connection):
npm run import-cli -- out/iot/csv/sensorReadings.chunk*.csv --analyze

# Import into a named database:
npm run import-cli -- out/iot/csv/sensorReadings.chunk0.csv \
  out/iot/csv/sensorReadings.chunk1.csv sensorReadings --drop --db hvymetl_iot
```

## 6. Column modeling (shared with ETL)

Both hvyMETL ETL and csvToAtlas use the same header conventions:

| Header / cell | Result |
| --- | --- |
| `address.city` | nested `{ address: { city } }` |
| `items.0.sku` | indexed array |
| `tags[]` with `["a","b"]` | JSON array at `tags` |
| `_id` column | kept as written (deterministic upsert key) |

Full rules: [cvsToAtlas README](https://github.com/7erry/cvsToAtlas#column-naming).
